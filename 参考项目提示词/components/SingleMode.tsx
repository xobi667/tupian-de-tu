
import React, { useState, useCallback, useMemo } from 'react';
import { ImageUploader } from './ImageUploader';
import { generatePrompts, generatePromptSuggestions } from '../services/geminiService';
import { historyService, fileToBase64 } from '../services/historyService';
import { GenerateIcon, LoadingIcon, SparklesIcon, InfoIcon } from './icons';
import type { Prompts } from '../types';

const KUROMI_MAGIC_POINTS = 15; // Must match App.tsx
const randomChoice = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

interface GenerationContextImages {
  imageFile: File | null;
  backgroundImageFile: File | null;
}
interface SingleModeProps {
  apiPointsUsed: number;
  timeRemaining: number;
  logApiCall: (cost?: number) => void;
  onGenerationStart: () => void;
  onGenerationSuccess: (prompts: Prompts, images: GenerationContextImages, recordId: string) => void;
  onGenerationError: (error: unknown) => void;
  onShowKeywordsHelper: () => void;
}

export const SingleMode: React.FC<SingleModeProps> = ({
  apiPointsUsed,
  timeRemaining,
  logApiCall,
  onGenerationStart,
  onGenerationSuccess,
  onGenerationError,
  onShowKeywordsHelper,
}) => {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [keywords, setKeywords] = useState<string>('');
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [isCooldown, setIsCooldown] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Optimization: Memoize random texts so they don't change on every render
  const kuromiTexts = useMemo(() => {
    // UPDATED: Removed numbering prefixes for consistency
    const singleNoImageLabels = ["在本小姐的魔法画板上许个愿吧！", "不给图也行，用语言描绘你的世界吧！", "快把你脑子里的奇思妙想告诉本小姐！"];
    const singleWithImageLabels = ["咏唱你的魔咒！(留空可直接分析哦~)", "Ok, 图收到了。然后呢？(可以直接点“施法”哦)", "快！在这里输入你的指令！(不输也行)"];
    const singleNoImagePlaceholders = ["比如：‘一只戴着皇冠的黑色小猫，坐在堆满金币的王座上，眼神超拽’... 越详细越好哦~", "快把你脑子里的画面描述给本小姐听！", "告诉本小姐你想画什么，剩下的交给我！"];
    const singleWithImagePlaceholders = ["想让我‘模仿’这张图？还是‘精修’一下？", "或者把你那不怎么样的提示词给我‘优化’一下？", "输入魔咒，比如‘变奏：赛博朋克’，给它变个身！"];

    return {
        uploaderTitle: "给本小姐一张图！(或者跳过也行啦)",
        keywordLabel: imageFile ? randomChoice(singleWithImageLabels) : randomChoice(singleNoImageLabels),
        keywordPlaceholder: imageFile ? randomChoice(singleWithImagePlaceholders) : randomChoice(singleNoImagePlaceholders),
    };
  }, [imageFile ? 'hasImage' : 'noImage']);

  const startCooldown = useCallback(() => {
    setIsCooldown(true);
    setTimeout(() => setIsCooldown(false), 4000); // 4-second cooldown
  }, []);
  
  const handleImageUpload = (file: File) => {
    setImageFile(file);
    setError('');
  };
  
  const handleGenerate = useCallback(async () => {
    if (apiPointsUsed >= KUROMI_MAGIC_POINTS) {
      setError(`哼！魔力耗尽啦！让本小姐休息一下，请在 ${timeRemaining} 秒后重试。`);
      return;
    }

    let finalKeywords = keywords.trim();

    if (!finalKeywords) {
        if (!imageFile) {
            setError('不给图又不给描述，本小姐怎么凭空想象嘛！');
            return;
        }
        finalKeywords = "__DEFAULT_SINGLE_MODE__";
    }


    logApiCall(1);
    setIsLoading(true);
    setError('');
    setSuggestions(null);
    onGenerationStart();

    try {
      const result = await generatePrompts(imageFile, null, finalKeywords, 'single');
      
      // SAVE TO HISTORY
      const now = new Date();
      const folderName = now.toISOString().split('T')[0].replace(/-/g, '.'); // YYYY.MM.DD
      const recordId = crypto.randomUUID();
      
      let mainImageBase64 = '';
      if (imageFile) {
          mainImageBase64 = await fileToBase64(imageFile);
      }

      await historyService.addRecord({
          id: recordId,
          timestamp: Date.now(),
          folderName: folderName,
          mode: 'single',
          images: {
              main: mainImageBase64,
          },
          prompts: result,
          generatedImages: {}
      });

      onGenerationSuccess(result, { imageFile, backgroundImageFile: null }, recordId);
    } catch (e) {
      onGenerationError(e);
    } finally {
      setIsLoading(false);
      startCooldown();
    }
  }, [imageFile, keywords, startCooldown, apiPointsUsed, timeRemaining, logApiCall, onGenerationStart, onGenerationSuccess, onGenerationError]);

  const handleGetSuggestions = useCallback(async () => {
    if (apiPointsUsed >= KUROMI_MAGIC_POINTS) {
      setError(`哼！魔力耗尽啦！让本小姐休息一下，请在 ${timeRemaining} 秒后重试。`);
      return;
    }
    if (!imageFile) {
      setError('本小姐得先看到图片才能给你灵感哦！');
      return;
    }
    logApiCall(1);
    setIsSuggestionsLoading(true);
    setError('');
    setSuggestions(null);

    try {
      const result = await generatePromptSuggestions(imageFile, null, keywords);
      setSuggestions(result);
    } catch (e) {
      onGenerationError(e);
    } finally {
      setIsSuggestionsLoading(false);
      startCooldown();
    }
  }, [imageFile, keywords, startCooldown, apiPointsUsed, timeRemaining, logApiCall, onGenerationError]);

  return (
    <div className="space-y-6 animate-fade-in">
        <ImageUploader 
            key="single-uploader"
            title={kuromiTexts.uploaderTitle} 
            onImageUpload={handleImageUpload} 
        />
        <div className="obsidian-card p-6 sm:p-8 group rounded-2xl">
            <label htmlFor="keywords" className="block text-lg sm:text-xl font-black mb-4 text-transparent bg-clip-text bg-gradient-to-r from-purple-200 to-white group-hover:from-purple-300 group-hover:to-purple-100 transition-colors">
                {kuromiTexts.keywordLabel}
            </label>
            <div className="relative">
            <textarea
                id="keywords"
                value={keywords}
                onChange={(e) => {
                    setKeywords(e.target.value)
                    if(suggestions) setSuggestions(null);
                }}
                placeholder={kuromiTexts.keywordPlaceholder}
                className="w-full h-40 p-4 sm:p-5 pr-16 sm:pr-32 bg-black/40 border border-white/10 rounded-2xl focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all placeholder-gray-500 resize-none text-gray-200 shadow-inner backdrop-blur-sm"
            />
                <div className="absolute top-3 right-3 sm:top-4 sm:right-4 flex flex-col gap-2 sm:gap-3">
                <button
                    onClick={onShowKeywordsHelper}
                    title="查看魔咒说明"
                    className="p-2 sm:p-2.5 rounded-full bg-white/5 hover:bg-purple-600 text-purple-300 hover:text-white transition-all duration-300 border border-white/10 hover:shadow-[0_0_15px_rgba(168,85,247,0.6)]"
                >
                    <InfoIcon className="text-xl"/>
                </button>
                <button
                    onClick={handleGetSuggestions}
                    disabled={isSuggestionsLoading || isLoading || !imageFile || isCooldown || apiPointsUsed >= KUROMI_MAGIC_POINTS}
                    title="让本小姐给你点灵感！"
                    className="p-2 sm:p-2.5 rounded-full bg-white/5 hover:bg-purple-600 text-purple-300 hover:text-white transition-all duration-300 border border-white/10 hover:shadow-[0_0_15px_rgba(168,85,247,0.6)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isSuggestionsLoading ? <LoadingIcon className="w-5 h-5"/> : <SparklesIcon className="text-xl"/>}
                </button>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-6">
                <span className="text-xs sm:text-sm font-bold text-gray-400 uppercase tracking-wider">快捷魔咒:</span>
                {['模仿', '复刻', '风格', '精修', '优化'].map((command) => (
                    <button
                    key={command}
                    onClick={() => setKeywords(prev => prev ? `${prev}, ${command}` : command)}
                    className="px-3 py-1.5 text-xs sm:text-sm font-bold text-purple-200 bg-purple-900/30 border border-purple-500/20 rounded-full hover:bg-purple-600 hover:text-white hover:shadow-[0_0_15px_rgba(168,85,247,0.5)] transition-all duration-300 hover:-translate-y-0.5"
                    title={`添加 “${command}”`}
                    >
                    {command}
                    </button>
                ))}
            </div>

            {suggestions && (
            <div className="mt-5 space-y-2 animate-fade-in bg-black/30 p-4 rounded-xl border border-white/5">
                <h4 className="text-sm font-bold text-gray-400 mb-2">本小姐的灵感，选一个吧！哼~</h4>
                {suggestions.map((suggestion, index) => (
                <button
                    key={index}
                    onClick={() => {
                    setKeywords(suggestion);
                    setSuggestions(null);
                    }}
                    className="w-full text-left p-3 bg-white/5 hover:bg-purple-600/20 rounded-lg border border-transparent hover:border-purple-500/40 transition-all text-gray-300 hover:text-purple-100 text-sm"
                >
                    {suggestion}
                </button>
                ))}
            </div>
            )}
            
            {error && <p className="text-sm text-red-400 mt-3 font-bold bg-red-900/20 p-2 rounded-lg text-center">{error}</p>}
            
                <button
                onClick={handleGenerate}
                disabled={isLoading || isCooldown || apiPointsUsed >= KUROMI_MAGIC_POINTS}
                className="w-full mt-8 flex items-center justify-center gap-3 py-4 px-6 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl font-extrabold text-lg text-white shadow-[0_0_25px_rgba(147,51,234,0.4)] hover:shadow-[0_0_40px_rgba(147,51,234,0.7)] hover:scale-[1.02] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none ring-1 ring-purple-400/30 ring-inset relative overflow-hidden group"
            >
                <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 skew-x-12"></div>
                {isLoading ? (
                    <>
                        <LoadingIcon className="w-6 h-6" />
                        <span className="text-lg">正在施展魔法...</span>
                    </>
                ) : apiPointsUsed >= KUROMI_MAGIC_POINTS ? (
                    `魔力耗尽啦！ (${timeRemaining}s)`
                ) : (
                    <>
                        <GenerateIcon className="text-2xl" />
                        {isCooldown ? '魔法冷却中...' : '开始施法！'}
                    </>
                )}
            </button>
        </div>
    </div>
  );
};
