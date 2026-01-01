
import React, { useState, useEffect, useCallback } from 'react';
import { CopyIcon, CheckIcon, MagicWandIcon, LoadingIcon, DownloadIcon, SparklesIcon, EmojiIcon, GenerateIcon, StarIcon } from './icons';
import { generateImageWithNanoBanana } from '../services/geminiService';
import { historyService } from '../services/historyService';
import type { Prompts, DualPrompts, CombinedSinglePrompts } from '../types';

const KUROMI_MAGIC_POINTS = 15;

interface GenerationContextImages {
    imageFile: File | null;
    backgroundImageFile: File | null;
    multiFiles?: File[];
}

interface PromptDisplayProps {
  prompts: Prompts | null;
  isLoading: boolean;
  logApiCall: (cost?: number) => void;
  apiPointsUsed: number;
  timeRemaining: number;
  handleApiError: (e: unknown) => void;
  generationContextImages: GenerationContextImages | null;
  recordId: string | null;
  savedGeneratedImages?: Record<string, string>;
}

interface PromptTableProps {
    icon?: string;
    title: string;
    prompt: string;
    logApiCall: (cost?: number) => void;
    apiPointsUsed: number;
    timeRemaining: number;
    handleApiError: (e: unknown) => void;
    contextImages: GenerationContextImages | null;
    useOriginalSceneFusion?: boolean; // New prop
    recordId: string | null;
    initialGeneratedImage?: string;
}

// REMOVED '2:3' as it is not supported by gemini-2.5-flash-image
const ASPECT_RATIOS = [
  { value: '1:1', label: '1:1 正方形' },
  { value: '3:4', label: '3:4 经典比例' },
  { value: '4:3', label: '4:3 插画' },
  { value: '9:16', label: '9:16 手机壁纸' },
  { value: '16:9', label: '16:9 桌面壁纸' },
];

// Helper hash function to map prompts to saved images
const hashPrompt = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return "img_" + Math.abs(hash).toString(16);
};

const PromptTable: React.FC<PromptTableProps> = ({ 
    icon, 
    title, 
    prompt, 
    logApiCall, 
    apiPointsUsed, 
    timeRemaining, 
    handleApiError, 
    contextImages,
    useOriginalSceneFusion = false,
    recordId,
    initialGeneratedImage
}) => {
    const [copied, setCopied] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedImage, setGeneratedImage] = useState<string | null>(initialGeneratedImage || null);
    const [error, setError] = useState('');
    const [useContextImages, setUseContextImages] = useState<boolean>(false);
    const [selectedAspectRatio, setSelectedAspectRatio] = useState<string>('1:1');
    const [loadingMessage, setLoadingMessage] = useState<{text: string, emoji: string}>({ text: "正在解析咒语构造...", emoji: "📜" });
    const [useProModel, setUseProModel] = useState<boolean>(false); // New Pro Mode State

    // Update image when prop changes (e.g. searching through history)
    useEffect(() => {
        setGeneratedImage(initialGeneratedImage || null);
    }, [initialGeneratedImage]);

    // Auto-enable context images if Original Scene Fusion is on OR if Multi files exist (default to referencing them)
    useEffect(() => {
        if (useOriginalSceneFusion) {
            setUseContextImages(true);
        }
        if (contextImages?.multiFiles && contextImages.multiFiles.length > 0) {
            setUseContextImages(true);
        }
    }, [useOriginalSceneFusion, contextImages]);

    const hasContextImages = contextImages && (contextImages.imageFile || contextImages.backgroundImageFile || (contextImages.multiFiles && contextImages.multiFiles.length > 0));

    useEffect(() => {
        setIsGenerating(false);
        setError('');
        // We generally reset, but if multi-files are present, we might want to default to true. 
        // For simplicity, let's keep the user manual control unless forced above.
        // setUseContextImages(false); 
        setSelectedAspectRatio('1:1');
        // Keep user preference for Pro mode? Or reset? Let's keep it per prompt table session for now.
    }, [prompt]);

    // Cycle through loading messages when generating
    useEffect(() => {
        if (!isGenerating) return;
        
        const messages = [
            { text: "正在解析咒语构造...", emoji: "📜" },
            { text: "汇聚暗黑魔法能量...", emoji: "🔮" },
            { text: "构建虚空画布...", emoji: "🌌" },
            { text: "注入灵魂色彩...", emoji: "✨" },
            { text: "最终召唤仪式...", emoji: "⚡" }
        ];
        let index = 0;
        setLoadingMessage(messages[0]);
        
        const interval = setInterval(() => {
            index = (index + 1) % messages.length;
            setLoadingMessage(messages[index]);
        }, 2500);
        
        return () => clearInterval(interval);
    }, [isGenerating]);

    const handleCopy = () => {
        navigator.clipboard.writeText(prompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const getAspectRatioStyle = (ratio: string) => {
        const [w, h] = ratio.split(':').map(Number);
        return { aspectRatio: `${w} / ${h}` };
    };

    const handleGenerateImage = useCallback(async () => {
        const imageGenCost = 2;
        if (apiPointsUsed + imageGenCost > KUROMI_MAGIC_POINTS) {
            setError(`哼！魔力不够生成图片啦！请在 ${timeRemaining} 秒后重试。`);
            return;
        }

        // --- PRO MODE KEY CHECK ---
        if (useProModel) {
            // Check if user has selected a key for paid usage
            try {
                // @ts-ignore
                const hasKey = await window.aistudio.hasSelectedApiKey();
                if (!hasKey) {
                    // @ts-ignore
                    await window.aistudio.openSelectKey();
                    // We assume success and proceed, or we could return and ask user to click again.
                    // For better UX, let's proceed. If they cancelled, the next call might fail, which catch block handles.
                }
            } catch (e) {
                console.error("Error checking API key status:", e);
                // Proceed anyway, error will be caught in generation
            }
        }
        // --------------------------

        logApiCall(imageGenCost);
        setIsGenerating(true);
        setGeneratedImage(null);
        setError('');
        try {
            const imagesToUse: File[] = [];
            let finalPrompt = `A high-resolution, professional image with a strict aspect ratio of ${selectedAspectRatio}. Scene description: ${prompt}`;

            // --- Multi Mode Logic ---
            if (contextImages?.multiFiles && contextImages.multiFiles.length > 0 && useContextImages) {
                // In multi mode, we pass ALL images to the model in order
                imagesToUse.push(...contextImages.multiFiles);
                
                // Construct a mapping description based on file count to prevent confusion
                const imageCount = contextImages.multiFiles.length;
                let mappingDesc = "";
                for(let i=0; i<imageCount; i++) {
                    mappingDesc += `- Image ${i+1}: Input Reference ${i+1}\n`;
                }

                // UPDATED PROMPT: Stronger emphasis on REPAINTING and SEAMLESS INTEGRATION
                finalPrompt = `[TASK: MULTI-IMAGE SYNTHESIS & RE-CREATION]
Input Images: ${imageCount} provided images.
${mappingDesc}

USER INSTRUCTION: "${prompt}"

CRITICAL MANDATES:
1. **NO COLLAGES**: Do NOT simply paste parts of images together. You must **RE-PAINT** the entire scene from scratch as a cohesive masterpiece.
2. **CONCEPT FUSION**: If the instruction says "Image 1's subject", "Image 2's composition", etc., you must extract those abstract elements and synthesize them.
   - Example: If taking specific composition, redraw the subject to fit that perspective perfectly.
   - Example: If taking specific lighting/color, apply it globally to the new subject.
3. **PHOTOREALISTIC BLENDING**: Ensure consistent global illumination, shadows, and texture. No floating objects.
4. **INTEGRITY**: The final image must look like a single photograph or artwork created at once.
5. **RESPECT ORDER**: Image 1 is strictly the first image provided, Image 2 is the second, etc. Do not mix them up.

OUTPUT: A high-quality, fully rendered image based on the synthesized prompt.`;

            } 
            // --- Dual Mode / Original Scene Fusion Logic ---
            else if (useOriginalSceneFusion && contextImages?.imageFile && contextImages?.backgroundImageFile) {
                imagesToUse.push(contextImages.imageFile); // First image: Product/Subject
                imagesToUse.push(contextImages.backgroundImageFile); // Second image: Background
                
                // UPDATED PROMPT: Stronger emphasis on PHOTOREALISM and CONTACT SHADOWS
                finalPrompt = `[TASK: PHOTOREALISTIC PRODUCT INTEGRATION & SCENE RE-LIGHTING]
INPUTS: 
- IMAGE 1: Subject/Product (The object to be placed).
- IMAGE 2: Background/Scene (The environment).

USER INSTRUCTION: "${prompt}"

CRITICAL EXECUTION RULES:
1. **SEAMLESS INTEGRATION**: The Subject (Img 1) must be physically grounded in the Background (Img 2).
2. **PERSPECTIVE ALIGNMENT**: You MUST warp/rotate the Subject to match the perspective planes of the Background. 
   - If placing on a table, match the table's slant.
3. **LIGHTING MATCH**: Analyze the light direction and color in Img 2. Re-light Img 1 to match perfectly.
4. **SHADOW GENERATION**: Cast realistic contact shadows (AO) and directional shadows from the Subject onto the Background surfaces.
5. **NO ARTIFACTS**: Clean edges. No white halos. No "sticker" look.
6. **RE-RENDER**: Do not just cut and paste. Re-render the pixels where the subject meets the environment to ensure material interaction (reflections, color bleeding).

OUTPUT: A photorealistic, seamless composite image.`;
            } 
            // --- Single Mode / Standard Logic ---
            else if (useContextImages && contextImages) {
                if (contextImages.imageFile) {
                    imagesToUse.push(contextImages.imageFile);
                }
                
                if (imagesToUse.length > 0) {
                     finalPrompt = `Using the provided image as a strong visual reference for the main subject, create a new image based on this detailed description: "${prompt}". Ensure high quality, 8k resolution, and correct aspect ratio of ${selectedAspectRatio}.`;
                }
            }

            // PASS THE ASPECT RATIO and PRO MODEL FLAG TO THE API
            const imageData = await generateImageWithNanoBanana(finalPrompt, imagesToUse, selectedAspectRatio, useProModel);
            setGeneratedImage(imageData);

            // SAVE to History using the recordId and prompt hash
            if (recordId) {
                try {
                    const promptHash = hashPrompt(prompt);
                    await historyService.saveGeneratedImage(recordId, promptHash, imageData);
                } catch (saveErr) {
                    console.error("Failed to save generated image to history:", saveErr);
                    // Don't block UI if save fails
                }
            }

        } catch (e) {
            handleApiError(e);
            const errorMessage = (e as Error).message;
            if (errorMessage.includes("Requested entity was not found")) {
                // Handle Key Error by resetting/re-prompting
                try {
                    // @ts-ignore
                    await window.aistudio.openSelectKey();
                } catch(ign) {}
                setError(`API Key失效或未选择。请重试并选择正确的付费项目Key。`);
            } else {
                setError(`图片生成失败: ${errorMessage}`);
            }
        } finally {
            setIsGenerating(false);
        }
    }, [prompt, apiPointsUsed, timeRemaining, logApiCall, handleApiError, useContextImages, contextImages, selectedAspectRatio, useOriginalSceneFusion, recordId, useProModel]);

    const handleDownloadImage = () => {
        if (!generatedImage) return;
        const link = document.createElement('a');
        link.href = `data:image/png;base64,${generatedImage}`;
        const filename = prompt.substring(0, 30).replace(/[^a-z0-9]/gi, '_').toLowerCase();
        link.download = `kuromi_${filename}_${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    
    const isNegativePrompt = title.includes('Negative') || title.includes('诅咒');

    // Determine toggle state visuals
    const isMultiMode = contextImages?.multiFiles && contextImages.multiFiles.length > 0;
    const showContextToggle = hasContextImages && !useOriginalSceneFusion;

    return (
        <div className="obsidian-card hover:shadow-[0_0_40px_rgba(147,51,234,0.2)] group/card">
            <div className="px-6 py-4 flex flex-wrap gap-2 justify-between items-center border-b border-white/5 bg-gradient-to-r from-white/5 to-transparent backdrop-blur-md">
                <h3 className={`font-black text-lg ${isNegativePrompt ? 'text-red-300' : 'text-purple-300'} drop-shadow-sm flex items-center gap-2`}>
                   {icon && <span className="emoji-reset text-2xl">{icon}</span>}
                   <span>{title}</span>
                </h3>
                <button 
                    onClick={handleCopy}
                    className="flex items-center gap-2 text-xs font-bold text-white bg-white/10 hover:bg-purple-600 hover:shadow-[0_0_15px_rgba(147,51,234,0.6)] transition-all duration-300 px-4 py-2 rounded-full border border-white/10"
                    title="复制到剪贴板"
                >
                    {copied ? <CheckIcon className="text-base" /> : <CopyIcon className="text-base" />}
                    {copied ? '已复制!' : '复制'}
                </button>
            </div>
            <div className="px-6 py-6">
              <div className="relative">
                 <div className="text-gray-200 whitespace-pre-wrap break-words font-mono text-sm leading-relaxed bg-black/40 p-6 rounded-xl border border-white/10 shadow-inner relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-purple-500/50"></div>
                    {prompt}
                 </div>
              </div>
            </div>
            {!isNegativePrompt && (
                <div className="px-6 pb-6 border-t border-white/5 pt-6 bg-black/20">
                     <div className="mb-6">
                        <div className="flex justify-between items-end mb-3 px-1">
                             <p className="text-xs font-bold text-purple-300 tracking-widest uppercase">选择画布比例</p>
                             
                             {/* PRO Mode Toggle */}
                             <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-bold transition-colors ${useProModel ? 'text-yellow-400 text-glow' : 'text-gray-500'}`}>
                                    {useProModel ? '💎 Pro 模式 (付费)' : '标准模式 (免费)'}
                                </span>
                                <button
                                    onClick={() => setUseProModel(!useProModel)}
                                    className={`relative inline-flex items-center h-5 w-9 rounded-full transition-colors focus:outline-none border ${useProModel ? 'bg-yellow-900/50 border-yellow-500/50' : 'bg-gray-800 border-white/10'}`}
                                >
                                    <span
                                        className={`${
                                            useProModel ? 'translate-x-4 bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.8)]' : 'translate-x-1 bg-gray-400'
                                        } inline-block w-3 h-3 transform rounded-full transition-all duration-300 ease-in-out`}
                                    />
                                </button>
                             </div>
                        </div>
                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                            {ASPECT_RATIOS.map(({ value, label }) => (
                                <button
                                    key={value}
                                    onClick={() => setSelectedAspectRatio(value)}
                                    className={`py-2 px-1 rounded-lg text-[10px] sm:text-xs font-bold transition-all duration-300 border ${
                                        selectedAspectRatio === value
                                            ? 'bg-purple-600 text-white border-purple-400 shadow-[0_0_15px_rgba(147,51,234,0.5)] scale-105'
                                            : 'bg-white/5 text-gray-400 border-transparent hover:bg-white/10 hover:text-gray-200 hover:border-purple-500/30'
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    {/* Control Toggles */}
                    <div className="flex flex-col items-center gap-4 mb-6">
                        {showContextToggle && (
                            <div className="flex items-center justify-center gap-4 text-sm p-2 bg-black/40 rounded-full w-fit mx-auto border border-white/10 shadow-lg">
                                <span className={`transition-colors px-2 font-bold ${!useContextImages ? 'text-purple-300 text-glow' : 'text-gray-600'}`}>
                                    仅提示词
                                </span>
                                <button
                                    onClick={() => setUseContextImages(prev => !prev)}
                                    className={`relative inline-flex items-center h-7 w-14 rounded-full transition-colors focus:outline-none border border-white/10 ${useContextImages ? 'bg-purple-900/50' : 'bg-gray-800'}`}
                                    aria-pressed={useContextImages}
                                >
                                    <span className="sr-only">切换是否结合原图生成</span>
                                    <span
                                        className={`${
                                            useContextImages ? 'translate-x-7 bg-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.8)]' : 'translate-x-1 bg-gray-400'
                                        } inline-block w-5 h-5 transform rounded-full transition-all duration-300 ease-in-out`}
                                    />
                                </button>
                                <span className={`transition-colors px-2 font-bold ${useContextImages ? 'text-purple-300 text-glow' : 'text-gray-600'}`}>
                                    {isMultiMode ? '结合参考图' : '结合原图'}
                                </span>
                            </div>
                        )}
                        
                        {useOriginalSceneFusion && (
                             <div className="flex items-center justify-center gap-2 text-xs font-bold text-green-300 bg-green-900/20 px-4 py-2 rounded-full border border-green-500/30 animate-pulse">
                                <SparklesIcon />
                                <span>已启用：智能3D光影场景融合</span>
                             </div>
                        )}
                    </div>

                    <button
                        onClick={handleGenerateImage}
                        disabled={isGenerating || apiPointsUsed >= KUROMI_MAGIC_POINTS}
                        className={`w-full flex items-center justify-center gap-3 py-4 px-6 rounded-xl font-bold text-white transition-all duration-300 border shadow-[0_0_20px_rgba(147,51,234,0.3)] hover:shadow-[0_0_35px_rgba(147,51,234,0.6)] hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none group overflow-hidden relative ${
                            useProModel 
                                ? 'bg-gradient-to-r from-yellow-600 to-orange-600 border-yellow-400/30 hover:border-yellow-300' 
                                : 'bg-gradient-to-r from-purple-600 to-indigo-600 border-purple-400/30 hover:border-purple-300'
                        }`}
                    >
                        <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500 skew-y-12"></div>
                        {isGenerating ? <LoadingIcon className="w-5 h-5" /> : (useProModel ? <StarIcon className="text-xl group-hover:animate-spin-slow" /> : <SparklesIcon className="text-xl group-hover:animate-spin-slow" />)}
                        <span className="relative z-10">
                            {isGenerating ? '正在召唤画面...' : (useProModel ? '立即生成 (Pro 高画质)' : '立即生成效果预览图')}
                        </span>
                    </button>
                    
                    {error && (
                        <p className="text-xs text-red-300 mt-3 text-center animate-fade-in bg-red-900/40 py-2 px-3 rounded-lg border border-red-500/30 backdrop-blur-sm">{error}</p>
                    )}

                    {isGenerating && (
                        <div className="mt-8 w-full flex justify-center animate-fade-in">
                             <div 
                                 className="w-full rounded-2xl bg-black/40 border border-white/10 flex flex-col items-center justify-center gap-4 relative overflow-hidden shadow-[inset_0_0_40px_rgba(147,51,234,0.1)] transition-all duration-500"
                                 style={getAspectRatioStyle(selectedAspectRatio)}
                             >
                                 <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 to-transparent animate-pulse"></div>
                                 <div className="relative z-10 flex flex-col items-center p-6 text-center gap-4">
                                     
                                     {/* Summoning Circle Loader */}
                                     <div className="summoning-loader mb-2">
                                        <div className="summoning-ring outer"></div>
                                        <div className="summoning-ring inner"></div>
                                        <div className="summoning-center"></div>
                                     </div>

                                     <div className="space-y-2">
                                        <p className="text-purple-200 font-bold text-sm tracking-[0.2em] animate-pulse uppercase flex items-center justify-center gap-2">
                                            <span>{loadingMessage.text}</span>
                                            <span className="emoji-reset">{loadingMessage.emoji}</span>
                                        </p>
                                        <p className="text-purple-400/50 text-xs">
                                            {useProModel ? 'Pro 引擎全速运转中...' : '请稍候，AI 正在绘制魔法绘卷'}
                                        </p>
                                     </div>
                                 </div>
                             </div>
                        </div>
                    )}

                    {generatedImage && (
                        <div className="mt-8 relative group animate-fade-in">
                            <div className="rounded-2xl overflow-hidden bg-black/50 border border-white/10 shadow-2xl ring-1 ring-white/5">
                                <img src={`data:image/png;base64,${generatedImage}`} alt="AI 生成的图片" className="w-full h-full object-contain"/>
                            </div>
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center backdrop-blur-[4px] rounded-2xl gap-2">
                                <button
                                    onClick={handleDownloadImage}
                                    className="bg-purple-600 text-white rounded-full p-5 transform scale-90 group-hover:scale-100 transition-all duration-300 shadow-[0_0_30px_rgba(168,85,247,0.6)] hover:bg-purple-500 border border-white/20"
                                    title="下载图片"
                                >
                                    <DownloadIcon className="text-3xl" />
                                </button>
                                <span className="text-white font-bold text-sm tracking-wide">点击下载</span>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export const PromptDisplay: React.FC<PromptDisplayProps> = ({ prompts, isLoading, generationContextImages, recordId, savedGeneratedImages, ...apiProps }) => {
    const [dualModeView, setDualModeView] = useState<'creative' | 'direct' | 'background'>('creative');
    const [singleModeView, setSingleModeView] = useState<'professional' | 'classic'>('professional');
    const [stripCopywriting, setStripCopywriting] = useState<boolean>(false); 
    const [useSimplifiedSubject, setUseSimplifiedSubject] = useState<boolean>(false);
    const [useOriginalSceneFusion, setUseOriginalSceneFusion] = useState<boolean>(false); // New State
    const [analysisMessage, setAnalysisMessage] = useState<{text: string, emoji: string}>({ text: "正在解析图像构造...", emoji: "📜" });

    useEffect(() => {
        setDualModeView('creative');
        setSingleModeView('professional');
        setStripCopywriting(false);
        setUseSimplifiedSubject(false);
        setUseOriginalSceneFusion(false);
    }, [prompts]);

    // Cycle through loading messages when analyzing (main loading state)
    useEffect(() => {
        if (!isLoading) return;
        
        const messages = [
            { text: "正在解析图像构造...", emoji: "📜" },
            { text: "汇聚暗黑魔法能量...", emoji: "🔮" },
            { text: "构建提示词结构...", emoji: "🌌" },
            { text: "注入艺术灵魂...", emoji: "✨" },
            { text: "最终召唤仪式...", emoji: "⚡" }
        ];
        let index = 0;
        setAnalysisMessage(messages[0]);
        
        const interval = setInterval(() => {
            index = (index + 1) % messages.length;
            setAnalysisMessage(messages[index]);
        }, 2000);
        
        return () => clearInterval(interval);
    }, [isLoading]);

    const getSavedImage = (promptText: string) => {
        if (!savedGeneratedImages) return undefined;
        const hash = hashPrompt(promptText);
        return savedGeneratedImages[hash];
    };

    if (isLoading) {
        return (
             <div className="text-center py-20 px-6 obsidian-card mt-12 flex flex-col items-center justify-center gap-6 animate-fade-in">
                {/* Unified Summoning Circle Loader */}
                <div className="summoning-loader relative scale-125">
                    <div className="summoning-ring outer"></div>
                    <div className="summoning-ring inner"></div>
                    <div className="summoning-center"></div>
                </div>
                
                <div className="space-y-3">
                    <h2 className="text-2xl sm:text-3xl font-black flex items-center justify-center gap-2 animate-pulse">
                         <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-200 to-pink-200">
                             {analysisMessage.text}
                        </span>
                        <span className="emoji-reset text-3xl">
                             {analysisMessage.emoji}
                        </span>
                    </h2>
                    <p className="text-purple-300/60 text-base animate-pulse">库洛米正在分析你的图片，稍等哦！</p>
                </div>
            </div>
        );
    }

    if (!prompts) {
        return (
            <div className="text-center py-16 px-6 obsidian-card mt-12 border-dashed border-2 border-white/10 bg-black/20 group hover:bg-black/40 transition-colors duration-500">
                <div className="relative inline-block mb-6 group-hover:scale-110 transition-transform duration-500 cursor-default">
                    {/* Glowing Effect Background */}
                    <div className="absolute inset-0 bg-purple-500/20 blur-xl rounded-full animate-pulse"></div>
                    
                    {/* Icon Container */}
                    <div className="relative bg-gradient-to-br from-purple-900/40 to-black/60 p-3 sm:p-4 rounded-full border border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.15)] flex items-center justify-center">
                        <GenerateIcon className="text-4xl sm:text-5xl drop-shadow-[0_0_10px_rgba(168,85,247,0.5)] animate-none" />
                    </div>
                </div>
                
                <h2 className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-200 to-white mb-3">
                    本小姐的旷世神咒，即将在此诞生！
                </h2>
                <p className="text-purple-300/60 text-base sm:text-lg font-medium">
                    快去咏唱你的魔咒，让本小姐大显身手！
                </p>
            </div>
        );
    }
    
    // Check Prompt Type
    const isDualMode = 'fusionWithSubject' in prompts && 'directFusion' in prompts;
    const isSingleOrMultiMode = 'professional' in prompts && 'classic' in prompts;
    const hasBothImages = generationContextImages?.imageFile && generationContextImages?.backgroundImageFile;

    // Render logic for Dual Mode and Single Mode remains largely the same, just ensure container styles are responsive
    if (isDualMode) {
        const dualPrompts = prompts as DualPrompts;
        
        let promptToDisplay = '';
        let secondaryControl = null;

        const baseButtonClass = "px-4 py-2 rounded-full font-bold text-xs sm:text-sm transition-all duration-300 focus:outline-none flex-1 border border-transparent whitespace-nowrap";
        const activeButtonClass = "bg-purple-600 text-white shadow-[0_0_20px_rgba(147,51,234,0.4)] border-purple-400/50";
        const inactiveButtonClass = "glass-btn text-gray-400 hover:text-gray-200";

        switch (dualModeView) {
            case 'creative': {
                const subjectPrompts = dualPrompts.fusionWithSubject;
                const canSimplify = subjectPrompts.detailed.chinese !== subjectPrompts.simplified.chinese;
                const finalUseSimplified = canSimplify && useSimplifiedSubject;
                promptToDisplay = finalUseSimplified ? subjectPrompts.simplified.chinese : subjectPrompts.detailed.chinese;
                
                secondaryControl = (
                    <div className="flex flex-col items-center justify-center gap-3">
                        <div className="flex items-center justify-center gap-4 p-2 rounded-full obsidian-card max-w-sm mx-auto bg-black/40 border-purple-500/20 shadow-lg">
                            <span className={`px-3 transition-colors text-xs sm:text-sm font-bold ${!finalUseSimplified ? 'text-purple-300 text-glow' : 'text-gray-600'} ${!canSimplify ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                精确主体
                            </span>
                            <button
                                onClick={() => setUseSimplifiedSubject(prev => !prev)}
                                disabled={!canSimplify}
                                className="relative inline-flex items-center h-7 w-12 rounded-full transition-colors bg-gray-800 border border-white/10 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                                aria-pressed={finalUseSimplified}
                            >
                                <span
                                    className={`${finalUseSimplified ? 'translate-x-6 bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.8)]' : 'translate-x-1 bg-gray-400'} inline-block w-5 h-5 transform rounded-full transition-all duration-300 ease-in-out`}
                                />
                            </button>
                            <span className={`px-3 transition-colors text-xs sm:text-sm font-bold ${finalUseSimplified ? 'text-purple-300 text-glow' : 'text-gray-600'} ${!canSimplify ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                融合背景
                            </span>
                        </div>
                    </div>
                );
                break;
            }
            case 'direct':
            case 'background': {
                const promptsToUse = dualModeView === 'direct' ? dualPrompts.directFusion : dualPrompts.fusionBackgroundOnly;
                const canStripCopy = promptsToUse.withText.chinese !== promptsToUse.withoutText.chinese;
                const finalStripCopywriting = canStripCopy && stripCopywriting;
                promptToDisplay = finalStripCopywriting ? promptsToUse.withoutText.chinese : promptsToUse.withText.chinese;
                const isDirectView = dualModeView === 'direct';

                secondaryControl = (
                    <div className="flex flex-col items-center justify-center gap-3">
                        <div className="flex items-center justify-center gap-4 p-2 rounded-full obsidian-card max-w-fit mx-auto bg-black/40 border-purple-500/20 shadow-lg px-6">
                            
                            {/* Copywriting Toggle */}
                            <div className="flex items-center gap-2">
                                <span className={`transition-colors text-xs sm:text-sm font-bold ${!finalStripCopywriting ? 'text-purple-300 text-glow' : 'text-gray-600'} ${!canStripCopy ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                    包含文案
                                </span>
                                <button
                                    onClick={() => setStripCopywriting(prev => !prev)}
                                    disabled={!canStripCopy}
                                    className="relative inline-flex items-center h-6 w-11 rounded-full transition-colors bg-gray-800 border border-white/10 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                                    aria-pressed={finalStripCopywriting}
                                >
                                    <span
                                        className={`${finalStripCopywriting ? 'translate-x-5 bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.8)]' : 'translate-x-1 bg-gray-400'} inline-block w-4 h-4 transform rounded-full transition-all duration-300 ease-in-out`}
                                    />
                                </button>
                                <span className={`transition-colors text-xs sm:text-sm font-bold ${finalStripCopywriting ? 'text-purple-300 text-glow' : 'text-gray-600'} ${!canStripCopy ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                    剥离文案
                                </span>
                            </div>

                            {/* New Original Scene Fusion Toggle - Only in Direct Mode and has both images */}
                            {isDirectView && hasBothImages && (
                                <>
                                    <div className="w-[1px] h-6 bg-white/10 mx-2"></div>
                                    <div className="flex items-center gap-2">
                                        <span className={`transition-colors text-xs sm:text-sm font-bold ${!useOriginalSceneFusion ? 'text-gray-600' : 'text-green-300 text-glow'}`}>
                                            智能场景融合
                                        </span>
                                        <button
                                            onClick={() => setUseOriginalSceneFusion(prev => !prev)}
                                            className="relative inline-flex items-center h-6 w-11 rounded-full transition-colors bg-gray-800 border border-white/10 focus:outline-none"
                                            aria-pressed={useOriginalSceneFusion}
                                        >
                                            <span
                                                className={`${useOriginalSceneFusion ? 'translate-x-5 bg-green-500 shadow-[0_0_10px_rgba(74,222,128,0.8)]' : 'translate-x-1 bg-gray-400'} inline-block w-4 h-4 transform rounded-full transition-all duration-300 ease-in-out`}
                                            />
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                );
                break;
            }
        }

        return (
          <div className="mt-10 space-y-8 animate-fade-in">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 p-2 rounded-2xl obsidian-card max-w-2xl mx-auto bg-black/40 border-purple-500/20 shadow-xl">
                <button onClick={() => setDualModeView('creative')} className={`${baseButtonClass} w-full sm:w-auto ${dualModeView === 'creative' ? activeButtonClass : inactiveButtonClass}`}>
                    创意融合
                </button>
                <button onClick={() => setDualModeView('direct')} className={`${baseButtonClass} w-full sm:w-auto ${dualModeView === 'direct' ? activeButtonClass : inactiveButtonClass}`}>
                    完美结合
                </button>
                <button onClick={() => setDualModeView('background')} className={`${baseButtonClass} w-full sm:w-auto ${dualModeView === 'background' ? activeButtonClass : inactiveButtonClass}`}>
                    仅提取背景
                </button>
            </div>
            
            {secondaryControl}

            <div className="space-y-6">
                <PromptTable 
                    icon="✨" 
                    title="中文神咒：" 
                    prompt={promptToDisplay} 
                    contextImages={generationContextImages} 
                    useOriginalSceneFusion={useOriginalSceneFusion}
                    recordId={recordId}
                    initialGeneratedImage={getSavedImage(promptToDisplay)}
                    {...apiProps} 
                />
            </div>
          </div>
        );
    }

    if (isSingleOrMultiMode) {
      const combinedPrompts = prompts as CombinedSinglePrompts;
      
      const jimmPrompts = stripCopywriting 
        ? combinedPrompts.professional.withoutText 
        : combinedPrompts.professional.withText;

      const classicPrompts = stripCopywriting
        ? combinedPrompts.classic.withoutText
        : combinedPrompts.classic.withText;


      return (
        <div className="mt-10 space-y-8 animate-fade-in">
          <div className="flex justify-center items-center gap-4 bg-black/40 p-3 rounded-full w-fit mx-auto border border-white/10 shadow-lg backdrop-blur-md">
              <span className={`text-sm font-bold transition-colors px-3 ${singleModeView === 'classic' ? 'text-purple-300 text-glow' : 'text-gray-500'}`}>经典版</span>
              <button
                onClick={() => setSingleModeView(prev => prev === 'classic' ? 'professional' : 'classic')}
                className="relative inline-flex items-center h-8 w-16 rounded-full transition-colors bg-gray-800 border border-white/10 focus:outline-none"
                aria-pressed={singleModeView === 'professional'}
              >
                <span
                  className={`${
                    singleModeView === 'professional' ? 'translate-x-8 bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.8)]' : 'translate-x-1 bg-gray-400'
                  } inline-block w-6 h-6 transform rounded-full transition-all duration-300 ease-in-out`}
                />
              </button>
              <span className={`text-sm font-bold transition-colors px-3 ${singleModeView === 'professional' ? 'text-purple-300 text-glow' : 'text-gray-500'}`}>专业版</span>
            </div>

            <div className="flex items-center justify-center gap-4 p-2 rounded-full obsidian-card max-w-xs mx-auto bg-black/40 border-purple-500/20 shadow-lg">
                <span className={`px-3 transition-colors text-xs sm:text-sm font-bold ${!stripCopywriting ? 'text-purple-300 text-glow' : 'text-gray-600'}`}>
                    包含文案
                </span>
                <button
                    onClick={() => setStripCopywriting(prev => !prev)}
                    className="relative inline-flex items-center h-7 w-12 rounded-full transition-colors bg-gray-800 border border-white/10 focus:outline-none"
                    aria-pressed={stripCopywriting}
                >
                    <span
                        className={`${
                            stripCopywriting ? 'translate-x-6 bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.8)]' : 'translate-x-1 bg-gray-400'
                        } inline-block w-5 h-5 transform rounded-full transition-all duration-300 ease-in-out`}
                    />
                </button>
                <span className={`px-3 transition-colors text-xs sm:text-sm font-bold ${stripCopywriting ? 'text-purple-300 text-glow' : 'text-gray-600'}`}>
                    剥离文案
                </span>
            </div>

            {singleModeView === 'professional' ? (
                <div className="space-y-10 animate-fade-in">
                    <div>
                        <h2 className="text-2xl sm:text-3xl font-black text-green-400 mb-6 text-center drop-shadow-lg tracking-tight flex items-center justify-center gap-2"><EmojiIcon emoji="✅" className="text-3xl"/> 正向提示词 (Positive)</h2>
                        <div className="space-y-6">
                            <PromptTable icon="✨" title="中文神咒：" prompt={jimmPrompts.positive.chinese} contextImages={generationContextImages} recordId={recordId} initialGeneratedImage={getSavedImage(jimmPrompts.positive.chinese)} {...apiProps} />
                        </div>
                    </div>
                    <div>
                        <h2 className="text-2xl sm:text-3xl font-black text-red-400 mb-6 text-center drop-shadow-lg tracking-tight flex items-center justify-center gap-2"><EmojiIcon emoji="❌" className="text-3xl"/> 反向提示词 (Negative)</h2>
                        <div className="space-y-6">
                            <PromptTable icon="💀" title="中文诅咒：" prompt={jimmPrompts.negative.chinese} contextImages={generationContextImages} recordId={recordId} initialGeneratedImage={getSavedImage(jimmPrompts.negative.chinese)} {...apiProps} />
                        </div>
                    </div>
                </div>
            ) : (
                <div className="space-y-10 animate-fade-in">
                     <div>
                        <h2 className="text-2xl sm:text-3xl font-black text-purple-300 mb-6 text-center drop-shadow-lg tracking-tight flex items-center justify-center gap-2"><EmojiIcon emoji="🎨" className="text-3xl"/> 经典风格提示词</h2>
                        <div className="space-y-6">
                            <PromptTable icon="✨" title="中文神咒：" prompt={classicPrompts.classic.chinese} contextImages={generationContextImages} recordId={recordId} initialGeneratedImage={getSavedImage(classicPrompts.classic.chinese)} {...apiProps} />
                        </div>
                    </div>
                </div>
            )}

        </div>
      );
    }
    
    return <div className="text-center text-red-500">无法识别的提示词格式</div>;
};
