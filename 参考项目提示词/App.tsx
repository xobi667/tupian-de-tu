
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { PromptDisplay } from './components/PromptDisplay';
import { SingleMode } from './components/SingleMode';
import { DualMode } from './components/DualMode';
import { MultiMode } from './components/MultiMode';
import { HistoryModal } from './components/HistoryModal';
import { SkullIcon, StarIcon, InfoIcon } from './components/icons';
import type { Prompts } from './types';

type Mode = 'single' | 'dual' | 'multi';

interface GenerationContextImages {
  imageFile: File | null;
  backgroundImageFile: File | null;
  multiFiles?: File[];
}

const KUROMI_MAGIC_POINTS = 15; // Total magic points per minute
const RATE_LIMIT_WINDOW_S = 60;

// --- Background Particles Component ---
// Memoized to prevent re-renders during app state changes (like mode switching)
const BackgroundParticles = React.memo(() => {
  // Generate CSS-based particles (Dust, Shards, and new Orbs)
  const particles = useMemo(() => {
    return Array.from({ length: 60 }).map((_, i) => {
      const r = Math.random();
      let type = 'p-dust';
      if (r > 0.85) type = 'p-shard'; // 15% Shards
      else if (r > 0.70) type = 'p-orb'; // 15% Orbs (Nebula-like)

      // Orbs can be slightly larger
      const baseSize = type === 'p-orb' ? 8 : 4;
      const size = Math.random() * baseSize + 2; 
      
      const left = Math.random() * 100;
      const delay = Math.random() * 20;
      const duration = 15 + Math.random() * 20; // Slow float
      const sway = (Math.random() - 0.5) * 120; // Horizontal sway amount
      const opacity = 0.3 + Math.random() * 0.5;

      return { id: i, type, size, left, delay, duration, sway, opacity };
    });
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none">
      <div className="nebula-bg"></div>
      {particles.map((p) => (
        <div
          key={p.id}
          className={`magic-particle ${p.type}`}
          style={{
            left: `${p.left}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            animation: `riseAndSway ${p.duration}s linear infinite`,
            animationDelay: `-${p.delay}s`,
            '--sway': `${p.sway}px`,
            '--p-opacity': p.opacity,
          } as React.CSSProperties}
        />
      ))}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/5 to-black/60 pointer-events-none"></div>
    </div>
  );
});

BackgroundParticles.displayName = 'BackgroundParticles';

const App: React.FC = () => {
  const [mode, setMode] = useState<Mode>('single');
  const [prompts, setPrompts] = useState<Prompts | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [showKeywordsHelper, setShowKeywordsHelper] = useState<boolean>(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [generationContextImages, setGenerationContextImages] = useState<GenerationContextImages | null>(null);
  const [currentRecordId, setCurrentRecordId] = useState<string | null>(null);
  
  // Reset Key to force re-mount of children components on "Soft Reset"
  const [resetKey, setResetKey] = useState<number>(0);

  // Rate Limiting State
  const [apiPointsUsed, setApiPointsUsed] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(RATE_LIMIT_WINDOW_S);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Optimization: Handle Mode Switch in one batch update to avoid double renders
  const handleModeSwitch = useCallback((newMode: Mode) => {
    if (newMode === mode) return; // Prevent unnecessary updates
    
    setMode(newMode);
    // Reset states immediately within the same event loop
    setPrompts(null);
    setError('');
    setGenerationContextImages(null);
    setCurrentRecordId(null);
  }, [mode]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, []);
  
  const logApiCall = (cost: number = 1) => {
    if (!timerRef.current) {
        setTimeRemaining(RATE_LIMIT_WINDOW_S);
        timerRef.current = setInterval(() => {
            setTimeRemaining(prev => {
                if (prev <= 1) {
                    clearInterval(timerRef.current!);
                    timerRef.current = null;
                    setApiPointsUsed(0);
                    return RATE_LIMIT_WINDOW_S;
                }
                return prev - 1;
            });
        }, 1000);
    }
    setApiPointsUsed(prev => prev + cost);
  };

  const handleApiError = (e: unknown) => {
    const errorMessage = (e as Error).message;
    console.error(e);
    if (errorMessage.includes('RESOURCE_EXHAUSTED') || errorMessage.includes('quota')) {
       setError(
        '哼！你的免费魔力（API Quota）用完啦！本小姐的魔法太受欢迎了嘛！\n' +
        '快去检查一下你的用量和账单，给你的魔力水晶充能吧！\n' +
        '用量查询: https://ai.dev/usage\n' +
        '账单信息: https://ai.google.dev/gemini-api/docs/billing'
      );
    } else {
      setError(`哎呀，魔法失败了！再试一次吧？错误信息: ${errorMessage}`);
    }
  };

  const handleGenerationStart = () => {
    setIsLoading(true);
    setError('');
    setPrompts(null);
    setGenerationContextImages(null);
    setCurrentRecordId(null);
  };

  const handleGenerationSuccess = (result: Prompts, images: GenerationContextImages, recordId: string) => {
    setPrompts(result);
    setGenerationContextImages(images);
    setCurrentRecordId(recordId);
    setIsLoading(false);
  };

  const handleGenerationError = (err: unknown) => {
    handleApiError(err);
    setIsLoading(false);
  };

  // Soft Reset Function (replaces window.location.reload)
  const handleAppReset = useCallback(() => {
      // 1. Reset Top Level State
      setMode('single');
      setPrompts(null);
      setIsLoading(false);
      setError('');
      setGenerationContextImages(null);
      setCurrentRecordId(null);
      
      // 2. Reset Rate Limits (Simulating a fresh visit)
      setApiPointsUsed(0);
      if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
      }
      setTimeRemaining(RATE_LIMIT_WINDOW_S);

      // 3. Force Re-mount of children (clears inputs/files)
      setResetKey(prev => prev + 1);
  }, []);

  const baseButtonClass = "flex-1 px-4 sm:px-6 py-3 rounded-xl font-extrabold text-xs sm:text-base transition-all duration-300 focus:outline-none relative overflow-hidden z-10 tracking-wide whitespace-nowrap";
  const activeButtonClass = "bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-[0_0_20px_rgba(168,85,247,0.5)] border border-purple-300/50 scale-[1.02]";
  const inactiveButtonClass = "glass-btn text-gray-400 hover:text-white";
  const magicPercentage = Math.max(0, Math.round(((KUROMI_MAGIC_POINTS - apiPointsUsed) / KUROMI_MAGIC_POINTS) * 100));
  const isMagicFull = magicPercentage === 100;

  return (
    <div className="min-h-screen text-gray-100 flex flex-col items-center p-3 sm:p-6 lg:p-8 relative overflow-x-hidden">
      <BackgroundParticles />
      
      <div className="w-full max-w-4xl mx-auto z-10 relative flex flex-col gap-8">
        
        {/* Top Bar with Magic Bar */}
        <div className="w-full max-w-3xl mx-auto">
             {/* Magic Bar */}
            <div 
                className="w-full obsidian-card p-4 ring-1 ring-purple-500/30 cursor-pointer hover:ring-purple-500/60 transition-all active:scale-[0.98] select-none"
                onDoubleClick={handleAppReset}
                title="⚡️ 双击此处重置应用 (清空当前任务)"
            >
                <div className="flex justify-between items-center text-xs sm:text-sm font-bold tracking-widest text-purple-200 mb-3 uppercase">
                    <span className="flex items-center gap-2"><StarIcon className="text-base" /> 魔力水晶能量</span>
                    <span className="text-purple-300">
                        {apiPointsUsed > 0 ? `${timeRemaining}s 回充中` : '能量充盈'}
                    </span>
                </div>
                <div className="w-full bg-black/80 rounded-full h-5 overflow-hidden border border-white/10 shadow-[inset_0_2px_6px_rgba(0,0,0,0.8)]">
                    <div 
                        className={`bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 h-full rounded-full relative shadow-[0_0_20px_rgba(236,72,153,0.8)] magic-bar-charge ${isMagicFull ? 'magic-bar-full magic-bar-full-tremble' : ''}`}
                        style={{ width: `${magicPercentage}%` }}
                    >
                        <div className="absolute inset-0 bg-gradient-to-t from-transparent to-white/40"></div>
                    </div>
                </div>
            </div>
        </div>


        {/* Header */}
        <header className="text-center relative group perspective-1000">
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[150%] bg-purple-600/10 blur-[90px] rounded-full pointer-events-none mix-blend-screen"></div>
            <div className="relative flex flex-col items-center justify-center gap-3">
                <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tighter flex flex-col items-center">
                  {/* HIDDEN HISTORY BUTTON TRIGGER - EASTER EGG */}
                  <button 
                      onClick={() => setIsHistoryOpen(true)}
                      className="text-transparent bg-clip-text bg-gradient-to-b from-white via-purple-100 to-purple-400 drop-shadow-lg hover:scale-110 active:scale-95 transition-transform duration-300 cursor-pointer focus:outline-none"
                      title="点击开启魔法史诗 (历史记录)"
                  >
                      KUROMI'S
                  </button>
                  <span className="block text-2xl sm:text-4xl lg:text-5xl mt-2 bg-gradient-to-r from-fuchsia-400 to-purple-500 bg-clip-text text-transparent">AI PROMPT EXPERT</span>
                </h1>
                <p className="text-purple-200/90 text-sm sm:text-lg font-medium flex items-center gap-3 mt-4 bg-black/40 px-6 py-3 rounded-full border border-purple-500/20 backdrop-blur-md shadow-lg">
                  <span className="animate-bounce"><SkullIcon className="text-xl" /></span> 
                  本小姐就是最强的AI绘画提示词专家！哼~
                  <span className="animate-bounce delay-100"><SkullIcon className="text-xl" /></span>
                </p>
            </div>
        </header>

        <main className="space-y-8">
          {/* Mode Switcher */}
          <div className="bg-black/40 p-2 rounded-2xl border border-white/10 backdrop-blur-md flex gap-2 max-w-xl mx-auto w-full shadow-xl overflow-x-auto">
              <button
                onClick={() => handleModeSwitch('single')}
                className={`${baseButtonClass} ${mode === 'single' ? activeButtonClass : inactiveButtonClass}`}
              >
                单图分析
              </button>
              <button
                onClick={() => handleModeSwitch('dual')}
                className={`${baseButtonClass} ${mode === 'dual' ? activeButtonClass : inactiveButtonClass}`}
              >
                融合背景
              </button>
              <button
                onClick={() => handleModeSwitch('multi')}
                className={`${baseButtonClass} ${mode === 'multi' ? activeButtonClass : inactiveButtonClass}`}
              >
                多图混搭
              </button>
          </div>

          {/* Main Content Area */}
          <div className="min-h-[300px]">
            {mode === 'single' && (
                <SingleMode 
                key={`single-${resetKey}`}
                apiPointsUsed={apiPointsUsed}
                timeRemaining={timeRemaining}
                logApiCall={logApiCall}
                onGenerationStart={handleGenerationStart}
                onGenerationSuccess={handleGenerationSuccess}
                onGenerationError={handleGenerationError}
                onShowKeywordsHelper={() => setShowKeywordsHelper(true)}
                />
            )}

            {mode === 'dual' && (
                <DualMode
                key={`dual-${resetKey}`}
                apiPointsUsed={apiPointsUsed}
                timeRemaining={timeRemaining}
                logApiCall={logApiCall}
                onGenerationStart={handleGenerationStart}
                onGenerationSuccess={handleGenerationSuccess}
                onGenerationError={handleGenerationError}
                onShowKeywordsHelper={() => setShowKeywordsHelper(true)}
                />
            )}

            {mode === 'multi' && (
                <MultiMode
                key={`multi-${resetKey}`}
                apiPointsUsed={apiPointsUsed}
                timeRemaining={timeRemaining}
                logApiCall={logApiCall}
                onGenerationStart={handleGenerationStart}
                onGenerationSuccess={handleGenerationSuccess}
                onGenerationError={handleGenerationError}
                onShowKeywordsHelper={() => setShowKeywordsHelper(true)}
                />
            )}
          </div>
          
          {/* Output & Errors */}
          <>
            {error && (
              <div className="obsidian-card border-red-500/50 text-red-200 px-6 py-5 text-center animate-fade-in shadow-[0_0_30px_rgba(220,38,38,0.3)] bg-red-950/60">
                 <div className="text-4xl mb-2"><SkullIcon /></div>
                 <p className="text-base font-bold whitespace-pre-wrap">{error}</p>
              </div>
            )}
            <PromptDisplay 
              key={`display-${resetKey}`}
              prompts={prompts} 
              isLoading={isLoading} 
              logApiCall={logApiCall}
              apiPointsUsed={apiPointsUsed}
              timeRemaining={timeRemaining}
              handleApiError={handleApiError}
              generationContextImages={generationContextImages}
              recordId={currentRecordId}
            />
          </>

        </main>
      </div>

      {/* History Modal */}
      <HistoryModal isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} />

      {/* Helper Modal */}
      {showKeywordsHelper && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 animate-fade-in backdrop-blur-md" onClick={() => setShowKeywordsHelper(false)}>
          <div 
            className="obsidian-card w-full max-w-2xl p-8 relative shadow-[0_0_60px_rgba(168,85,247,0.4)] border-purple-500/50 !bg-[#15151e]" 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-4 mb-6 border-b border-white/10 pb-4">
              <div className="bg-purple-600/20 p-3 rounded-xl border border-purple-500/50">
                <InfoIcon className="text-3xl text-purple-300 animate-pulse" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-white">
                魔咒小词典
              </h2>
            </div>
            <button 
              onClick={() => setShowKeywordsHelper(false)} 
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-3xl p-2 w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded-full transition-colors"
            >
              ×
            </button>
            <div className="max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar grid gap-3">
              {[
                { title: "多图混搭", desc: "【新功能】上传多张图片，指定每张图的用途！例如：‘用图一的主体，图二的构图，图三的色调’。" },
                { title: "模仿", desc: "哼，想知道这张图的秘密？本小姐帮你深度分析，生成一段超棒的提示词！" },
                { title: "复刻", desc: "看好了！本小姐要用超长咒语，把这张图1:1完美复制出来，连像素都不放过！" },
                { title: "匹配字体", desc: "本小姐的独门绝技！为你的画面智能设计并匹配最完美的字体风格！" },
                { title: "风格", desc: "喜欢这张图的调调？本小姐帮你提炼出它的灵魂风格，然后用到别的地方去！" },
                { title: "精修", desc: "让本小姐给你P一下！保证产品完美无瑕，闪闪发光，变成顶级商业大片！" },
                { title: "主图", desc: "想要一张能卖爆的电商主图？本小姐帮你把产品精修到完美，再给它配个最搭的场景！" },
                { title: "人物精修", desc: "看本小姐的魔镜！只把你的人脸修得美美的，保证身体、衣服和背景一动不动！" },
                { title: "三视图", desc: "想当设计师？本小姐帮你把角色或产品，一键生成专业的正面、侧面、背面设计图！" },
                { title: "变奏", desc: "觉得无聊了？试试“变奏：赛博朋克”，本小姐就能在原图基础上给你变个身，超酷的！" },
                { title: "优化", desc: "把你自己写的提示词丢进来！本小姐帮你分析诊断，一键升级成专家级神咒！" }
              ].map((item, idx) => (
                 <div key={idx} className="p-4 rounded-xl bg-white/5 hover:bg-purple-500/10 border border-transparent hover:border-purple-500/30 transition-all">
                    <strong className="block font-bold text-purple-300 text-base mb-1 flex items-center gap-2">
                        <span className="text-purple-500">●</span>
                        {item.title}
                    </strong>
                    <p className="text-gray-400 text-sm leading-relaxed ml-4">{item.desc}</p>
                 </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;
