
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { generatePrompts, generateImageWithNanoBanana } from '../services/geminiService';
import { historyService, fileToBase64 } from '../services/historyService';
import { GenerateIcon, LoadingIcon, InfoIcon, UploadIcon, MagicWandIcon, TrashIcon, CheckIcon, SparklesIcon } from './icons';
import type { Prompts } from '../types';

const KUROMI_MAGIC_POINTS = 15; // Must match App.tsx
const MAX_IMAGES = 20; // Increased limit

interface GenerationContextImages {
  imageFile: File | null;
  backgroundImageFile: File | null;
  multiFiles?: File[];
}

export type ImageRole = 'subject' | 'background' | 'style' | 'element' | 'none';

interface MultiImageSlot {
  id: string; // Unique ID for drag key
  displayIndex: number; // 1-based index for display
  file: File | null;
  role: ImageRole;
}

interface MultiModeProps {
  apiPointsUsed: number;
  timeRemaining: number;
  logApiCall: (cost?: number) => void;
  onGenerationStart: () => void;
  onGenerationSuccess: (prompts: Prompts, images: GenerationContextImages, recordId: string) => void;
  onGenerationError: (error: unknown) => void;
  onShowKeywordsHelper: () => void;
}

// Helper to display numbers in Chinese
const getNumberLabel = (num: number) => {
  const map = ['零','一','二','三','四','五','六','七','八','九','十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十'];
  return map[num] || num.toString();
};

// Helper hash function to map prompts to saved images (Must match PromptDisplay logic)
const hashPrompt = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return "img_" + Math.abs(hash).toString(16);
};

const RoleBadge: React.FC<{ role: ImageRole }> = ({ role }) => {
    switch(role) {
        case 'subject': return <span className="px-2 py-0.5 rounded-full bg-yellow-500/80 text-white text-[10px] font-bold border border-yellow-300/50 shadow-sm flex items-center gap-1 backdrop-blur-md">👑 主体</span>;
        case 'background': return <span className="px-2 py-0.5 rounded-full bg-blue-500/80 text-white text-[10px] font-bold border border-blue-300/50 shadow-sm flex items-center gap-1 backdrop-blur-md">🖼️ 背景</span>;
        case 'style': return <span className="px-2 py-0.5 rounded-full bg-pink-500/80 text-white text-[10px] font-bold border border-pink-300/50 shadow-sm flex items-center gap-1 backdrop-blur-md">✨ 风格</span>;
        case 'element': return <span className="px-2 py-0.5 rounded-full bg-green-500/80 text-white text-[10px] font-bold border border-green-300/50 shadow-sm flex items-center gap-1 backdrop-blur-md">🧩 素材</span>;
        default: return null;
    }
};

// Sub-component for individual image slot
const ImageSlotCard: React.FC<{
  slot: MultiImageSlot;
  index: number;
  onUpload: (files: FileList) => void;
  onRemove: () => void;
  onRoleChange: (role: ImageRole) => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  canRemove: boolean;
  isSelected: boolean;
  onClick: (e: React.MouseEvent) => void;
}> = ({ slot, index, onUpload, onRemove, onRoleChange, onDragStart, onDragOver, onDrop, canRemove, isSelected, onClick }) => {
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (slot.file) {
      const url = URL.createObjectURL(slot.file);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreview(null);
    }
  }, [slot.file]);

  return (
    <div 
        className={`relative group w-32 h-40 sm:w-36 sm:h-44 flex-shrink-0 animate-fade-in transition-all duration-300 ${isSelected ? 'scale-95' : 'scale-100'}`}
        draggable={!!slot.file}
        onDragStart={(e) => onDragStart(e, index)}
        onDragOver={(e) => onDragOver(e, index)}
        onDrop={(e) => onDrop(e, index)}
        onClick={(e) => {
            if (slot.file) onClick(e);
        }}
    >
      <div 
        className={`
          w-full h-full rounded-2xl border-2 cursor-pointer transition-all duration-300 flex flex-col items-center justify-start overflow-hidden relative shadow-md
          ${isSelected 
            ? 'border-purple-400 bg-purple-900/40 shadow-[0_0_20px_rgba(168,85,247,0.6)] ring-2 ring-purple-500 ring-offset-2 ring-offset-black' 
            : slot.file 
                ? 'border-purple-500/30 bg-black/40' 
                : 'border-dashed border-purple-500/20 bg-black/20 hover:bg-purple-900/10 hover:border-purple-400/50'
          }
        `}
      >
        {/* Label Header */}
        <div className="w-full py-1 bg-black/40 flex justify-between items-center px-2 z-20 absolute top-0 left-0 backdrop-blur-sm border-b border-white/5 pointer-events-none">
             <span className="text-[10px] font-bold text-gray-400">
                {`图${getNumberLabel(index + 1)}`}
             </span>
             {slot.file && (
                 <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${isSelected ? 'bg-purple-500 border-purple-400' : 'border-white/30 bg-black/50'}`}>
                     {isSelected && <CheckIcon className="text-[10px] text-white" />}
                 </div>
             )}
        </div>

        {preview ? (
          <>
            <img 
              src={preview} 
              alt={`Slot ${index + 1}`} 
              className="w-full h-full object-cover absolute inset-0 z-0" 
            />
            
            {/* Role Badge */}
            <div className="absolute top-7 left-1/2 -translate-x-1/2 z-10 w-full flex justify-center pointer-events-none">
                <RoleBadge role={slot.role} />
            </div>

            {/* Hover Overlay Controls */}
            <div 
                className={`absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity delay-75 duration-200 flex flex-col items-center justify-center gap-2 backdrop-blur-[2px] z-30 p-2`}
            >
               {/* Role Buttons */}
               <div className="grid grid-cols-2 gap-1 w-full">
                    <button onClick={(e) => { e.stopPropagation(); onRoleChange('subject'); }} className={`text-[9px] px-1 py-1 rounded border ${slot.role === 'subject' ? 'bg-yellow-500 text-white border-yellow-300' : 'bg-white/5 text-gray-300 border-white/10 hover:bg-white/20'}`}>👑 主体</button>
                    <button onClick={(e) => { e.stopPropagation(); onRoleChange('background'); }} className={`text-[9px] px-1 py-1 rounded border ${slot.role === 'background' ? 'bg-blue-500 text-white border-blue-300' : 'bg-white/5 text-gray-300 border-white/10 hover:bg-white/20'}`}>🖼️ 背景</button>
                    <button onClick={(e) => { e.stopPropagation(); onRoleChange('element'); }} className={`text-[9px] px-1 py-1 rounded border ${slot.role === 'element' ? 'bg-green-500 text-white border-green-300' : 'bg-white/5 text-gray-300 border-white/10 hover:bg-white/20'}`}>🧩 素材</button>
                    <button onClick={(e) => { e.stopPropagation(); onRoleChange('style'); }} className={`text-[9px] px-1 py-1 rounded border ${slot.role === 'style' ? 'bg-pink-500 text-white border-pink-300' : 'bg-white/5 text-gray-300 border-white/10 hover:bg-white/20'}`}>✨ 风格</button>
               </div>
               
               <div className="w-full h-[1px] bg-white/10 my-1"></div>
               
               <div className="flex gap-2 w-full">
                   <label 
                        className="flex-1 cursor-pointer bg-purple-600 hover:bg-purple-500 text-white text-[10px] py-1.5 rounded text-center transition-colors"
                        onClick={(e) => e.stopPropagation()} // Stop propagation to prevent selection toggle when changing file
                    >
                       更换
                       <input 
                        type="file" 
                        className="hidden" 
                        accept="image/*"
                        onChange={(e) => {
                            if (e.target.files && e.target.files.length > 0) {
                                onUpload(e.target.files);
                            }
                            e.target.value = ''; // Reset input to allow selecting same file again and clean state
                        }}
                        />
                   </label>
                   {canRemove && (
                       <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="px-2 bg-red-500/80 hover:bg-red-500 rounded text-white transition-colors">
                           <TrashIcon className="text-sm"/>
                       </button>
                   )}
               </div>
            </div>
          </>
        ) : (
          <label 
            className="w-full h-full flex flex-col items-center justify-center cursor-pointer pt-4 hover:bg-white/5 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center gap-2 group-hover:scale-110 transition-transform">
                <UploadIcon className="text-2xl text-purple-400/40" />
                <span className="text-[10px] text-purple-300/50">点击上传</span>
            </div>
            <input 
              type="file" 
              className="hidden" 
              accept="image/*"
              multiple // Allow multiple files selection
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                    onUpload(e.target.files);
                }
                e.target.value = ''; // Reset input
              }}
            />
          </label>
        )}
      </div>
    </div>
  );
};

export const MultiMode: React.FC<MultiModeProps> = ({
  apiPointsUsed,
  timeRemaining,
  logApiCall,
  onGenerationStart,
  onGenerationSuccess,
  onGenerationError,
  onShowKeywordsHelper,
}) => {
  // Start with 3 slots by default
  const [imageSlots, setImageSlots] = useState<MultiImageSlot[]>([
    { id: 'slot-1', displayIndex: 1, file: null, role: 'none' },
    { id: 'slot-2', displayIndex: 2, file: null, role: 'none' },
    { id: 'slot-3', displayIndex: 3, file: null, role: 'none' }
  ]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [keywords, setKeywords] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isCooldown, setIsCooldown] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isDirectLoading, setIsDirectLoading] = useState<boolean>(false);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);
  
  // Debounce ref to prevent duplicate file processing
  const processingRef = useRef(false);

  // --- SLOT MANAGEMENT ---

  const createSlot = (file: File | null = null, role: ImageRole = 'none'): MultiImageSlot => ({
      id: `slot-${Date.now()}-${Math.random()}`,
      displayIndex: 0, // Will be recalculated
      file,
      role
  });

  const handleAddSlot = useCallback(() => {
    if (imageSlots.length >= MAX_IMAGES) {
        setError(`哼！一次最多只能处理${MAX_IMAGES}张图片哦！本小姐会累坏的！`);
        setTimeout(() => setError(""), 3000);
        return false;
    }
    setImageSlots(prev => {
        const newSlots = [...prev, createSlot()];
        return newSlots.map((s, i) => ({ ...s, displayIndex: i + 1 }));
    });
    return true;
  }, [imageSlots.length]);

  const handleRemoveSlot = (indexToRemove: number) => {
    setImageSlots(prev => {
        const slotToRemove = prev[indexToRemove];
        const newSlots = prev.filter((_, i) => i !== indexToRemove);
        
        // If we removed a selected item, unselect it
        if (selectedIds.has(slotToRemove.id)) {
            const newSelected = new Set(selectedIds);
            newSelected.delete(slotToRemove.id);
            setSelectedIds(newSelected);
        }

        // Reset last selected index if needed or adjust? 
        // Simplest to reset anchor on structure change to avoid bugs
        setLastSelectedIndex(null);

        // Always keep at least 2 slots if possible, or add empty ones if we deleted everything
        if (newSlots.length < 2) {
            while (newSlots.length < 2) {
                newSlots.push(createSlot());
            }
        }
        return newSlots.map((s, i) => ({ ...s, displayIndex: i + 1 }));
    });
  };

  const processFilesToAdd = (files: FileList | File[], targetIndex: number = -1) => {
      // Debounce check
      if (processingRef.current) return;
      processingRef.current = true;
      setTimeout(() => { processingRef.current = false; }, 300);

      const newFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
      if (newFiles.length === 0) return;

      setImageSlots(prev => {
          // CRITICAL: Deep clone array items to avoid mutating 'prev' directly.
          let updatedSlots = prev.map(slot => ({ ...slot }));
          
          let filesToProcess = [...newFiles];
          
          // Case 1: Fill specific target if empty and we have files
          if (targetIndex >= 0 && targetIndex < updatedSlots.length && !updatedSlots[targetIndex].file && filesToProcess.length > 0) {
              updatedSlots[targetIndex].file = filesToProcess.shift()!;
          }

          // Case 2: Fill remaining empty slots
          for (let i = 0; i < updatedSlots.length; i++) {
              if (!updatedSlots[i].file && filesToProcess.length > 0) {
                  updatedSlots[i].file = filesToProcess.shift()!;
              }
          }

          // Case 3: Append new slots
          while (filesToProcess.length > 0) {
              if (updatedSlots.length >= MAX_IMAGES) {
                  setError(`只能塞下${MAX_IMAGES}张图！剩下的被我丢掉啦！`);
                  setTimeout(() => setError(""), 4000);
                  break;
              }
              updatedSlots.push(createSlot(filesToProcess.shift()!));
          }

          return updatedSlots.map((s, i) => ({ ...s, displayIndex: i + 1 }));
      });
  };

  const handleRoleChange = (index: number, role: ImageRole) => {
      setImageSlots(prev => {
          const newSlots = [...prev];
          newSlots[index] = { ...newSlots[index], role };
          return newSlots;
      });
  };

  // --- SELECTION LOGIC (WINDOWS STYLE) ---

  const handleSlotClick = (e: React.MouseEvent, index: number) => {
      const slot = imageSlots[index];
      if (!slot.file) return;

      e.stopPropagation(); // Stop propagating to container (which deselects)

      const anchor = lastSelectedIndex === null ? index : lastSelectedIndex;

      if (e.shiftKey) {
          // Range Selection
          const start = Math.min(anchor, index);
          const end = Math.max(anchor, index);
          
          const idsInRange = imageSlots.slice(start, end + 1)
              .filter(s => s.file)
              .map(s => s.id);
              
          // If Ctrl is held, add range to current selection. Else replace.
          const prevSelection = (e.ctrlKey || e.metaKey) ? selectedIds : new Set<string>();
          const nextSet = new Set(prevSelection);
          idsInRange.forEach(id => nextSet.add(id));
          setSelectedIds(nextSet);
          
          // Note: Shift click does NOT move the anchor in standard OS behavior
      } else if (e.ctrlKey || e.metaKey) {
          // Toggle Selection
          const nextSet = new Set(selectedIds);
          if (nextSet.has(slot.id)) {
              nextSet.delete(slot.id);
          } else {
              nextSet.add(slot.id);
          }
          setSelectedIds(nextSet);
          setLastSelectedIndex(index); // Move anchor
      } else {
          // Single Selection (Clear others)
          setSelectedIds(new Set([slot.id]));
          setLastSelectedIndex(index); // Move anchor
      }
  };

  const handleBatchRole = (role: ImageRole) => {
      if (selectedIds.size === 0) return;
      setImageSlots(prev => prev.map(slot => 
          selectedIds.has(slot.id) && slot.file ? { ...slot, role } : slot
      ));
  };

  const handleBatchDelete = () => {
      if (selectedIds.size === 0) return;
      if (!confirm(`确定要移除选中的 ${selectedIds.size} 张图片吗？`)) return;

      setImageSlots(prev => {
          const remaining = prev.filter(slot => !selectedIds.has(slot.id));
          while (remaining.length < 2) {
              remaining.push(createSlot());
          }
          return remaining.map((s, i) => ({ ...s, displayIndex: i + 1 }));
      });
      setSelectedIds(new Set());
      setLastSelectedIndex(null);
  };

  // --- DRAG SORT & DROP UPLOAD LOGIC ---
  const handleDragStart = (e: React.DragEvent, position: number) => {
    dragItem.current = position;
  };

  const handleDragOver = (e: React.DragEvent, position: number) => {
    e.preventDefault();
    e.stopPropagation();
    dragOverItem.current = position;
  };

  const handleSortDrop = (e: React.DragEvent, position: number) => {
    e.preventDefault();
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        processFilesToAdd(e.dataTransfer.files, position);
        return;
    }

    if (dragItem.current === null || dragOverItem.current === null) return;
    
    const copyListItems = [...imageSlots];
    const dragItemContent = copyListItems[dragItem.current];
    copyListItems.splice(dragItem.current, 1);
    copyListItems.splice(dragOverItem.current, 0, dragItemContent);
    
    dragItem.current = null;
    dragOverItem.current = null;
    
    const reIndexed = copyListItems.map((slot, i) => ({ ...slot, displayIndex: i + 1 }));
    setImageSlots(reIndexed);
    setLastSelectedIndex(null); // Reset selection anchor on sort
  };

  // Global Container Drop (for appending files)
  const handleContainerDrop = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          processFilesToAdd(e.dataTransfer.files);
      }
  };

  const handleContainerDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isDraggingOver) setIsDraggingOver(true);
  };
  
  const handleContainerDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(false);
  };

  // --- PASTE LOGIC ---
  const handlePaste = useCallback((e: ClipboardEvent | React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.type.startsWith('image/')) {
              const file = item.getAsFile();
              if (file) files.push(file);
          }
      }
      if (files.length > 0) {
          e.preventDefault();
          processFilesToAdd(files);
      }
  }, [imageSlots]);

  useEffect(() => {
      window.addEventListener('paste', handlePaste as any);
      return () => {
          window.removeEventListener('paste', handlePaste as any);
      };
  }, [handlePaste]);


  const startCooldown = useCallback(() => {
    setIsCooldown(true);
    setTimeout(() => setIsCooldown(false), 4000);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (apiPointsUsed >= KUROMI_MAGIC_POINTS) {
      setError(`哼！魔力耗尽啦！让本小姐休息一下，请在 ${timeRemaining} 秒后重试。`);
      return;
    }

    const validSlotData = imageSlots.filter(s => s.file !== null) as (MultiImageSlot & { file: File })[];

    if (validSlotData.length < 2) {
      setError('多图模式至少需要两张图片哦！');
      return;
    }

    if (!keywords.trim()) {
      setError('请告诉本小姐要怎么组合！或者直接用快捷魔咒~');
      return;
    }

    logApiCall(1);
    setIsLoading(true);
    setError('');
    onGenerationStart();

    try {
      const validFiles = validSlotData.map(s => s.file);
      const metadata = validSlotData.map((s, idx) => ({
          fileIndex: idx,
          role: s.role,
          originalIndex: s.displayIndex 
      }));

      const result = await generatePrompts(null, null, keywords, 'multi', validFiles, metadata);

      const now = new Date();
      const folderName = now.toISOString().split('T')[0].replace(/-/g, '.');
      const recordId = crypto.randomUUID();

      const multiImagesBase64: string[] = [];
      for (const file of validFiles) {
          multiImagesBase64.push(await fileToBase64(file));
      }

      await historyService.addRecord({
          id: recordId,
          timestamp: Date.now(),
          folderName: folderName,
          mode: 'multi',
          images: { multi: multiImagesBase64 },
          prompts: result,
          generatedImages: {}
      });

      onGenerationSuccess(result, { imageFile: null, backgroundImageFile: null, multiFiles: validFiles }, recordId);
    } catch (e) {
      onGenerationError(e);
    } finally {
      setIsLoading(false);
      startCooldown();
    }
  }, [imageSlots, keywords, startCooldown, apiPointsUsed, timeRemaining, logApiCall, onGenerationStart, onGenerationSuccess, onGenerationError]);

  // NEW: Direct Generation Logic
  const handleDirectGenerate = useCallback(async () => {
    const imageGenCost = 2; // Higher cost for image gen
    if (apiPointsUsed + imageGenCost > KUROMI_MAGIC_POINTS) {
      setError(`哼！魔力耗尽啦！生图比较累，让本小姐休息一下，请在 ${timeRemaining} 秒后重试。`);
      return;
    }

    const validSlotData = imageSlots.filter(s => s.file !== null) as (MultiImageSlot & { file: File })[];

    if (validSlotData.length < 2) {
      setError('多图模式至少需要两张图片哦！');
      return;
    }

    if (!keywords.trim()) {
      setError('请告诉本小姐要怎么组合！');
      return;
    }

    logApiCall(imageGenCost);
    setIsDirectLoading(true);
    setError('');
    onGenerationStart();

    try {
        const validFiles = validSlotData.map(s => s.file);
        
        // 1. Generate Image Directly
        // Construct a direct prompt that incorporates the user's keywords plus role info simply
        let directPrompt = keywords;
        const roleInfo = validSlotData.map((s, i) => {
            if (s.role !== 'none') return `Image ${i+1} is ${s.role}`;
            return null;
        }).filter(Boolean).join('. ');
        
        if (roleInfo) directPrompt += `. [Roles: ${roleInfo}]`;

        const generatedImageBase64 = await generateImageWithNanoBanana(directPrompt, validFiles, '1:1');

        // 2. Construct Dummy Prompt Object
        // We use the 'keywords' as the prompt text so the user sees what they entered
        const dummyPrompts: Prompts = {
            professional: {
                withText: { positive: { chinese: keywords }, negative: { chinese: "" } },
                withoutText: { positive: { chinese: keywords }, negative: { chinese: "" } }
            },
            classic: {
                withText: { classic: { chinese: keywords } },
                withoutText: { classic: { chinese: keywords } }
            }
        };

        // 3. Save to History
        const now = new Date();
        const folderName = now.toISOString().split('T')[0].replace(/-/g, '.');
        const recordId = crypto.randomUUID();

        const multiImagesBase64: string[] = [];
        for (const file of validFiles) {
            multiImagesBase64.push(await fileToBase64(file));
        }

        // IMPORTANT: Calculate hash so PromptDisplay can find the image
        const promptHash = hashPrompt(keywords);

        await historyService.addRecord({
            id: recordId,
            timestamp: Date.now(),
            folderName: folderName,
            mode: 'multi',
            images: { multi: multiImagesBase64 },
            prompts: dummyPrompts,
            generatedImages: {
                [promptHash]: generatedImageBase64
            }
        });

        // 4. Trigger Success
        onGenerationSuccess(dummyPrompts, { imageFile: null, backgroundImageFile: null, multiFiles: validFiles }, recordId);

    } catch (e) {
        onGenerationError(e);
    } finally {
        setIsDirectLoading(false);
        startCooldown();
    }
  }, [imageSlots, keywords, startCooldown, apiPointsUsed, timeRemaining, logApiCall, onGenerationStart, onGenerationSuccess, onGenerationError]);

  const quickSpells = [
      { label: "按标注尺寸比例合成", cmd: "识别图片中的尺寸和数量标注，严格按照物理比例和指定数量进行合成，确保大小关系正确" },
      { label: "将【素材】装饰到【主体】上", cmd: "自动识别主体和装饰素材，将装饰素材自然地融合到主体上" },
      { label: "全员合照/拼接", cmd: "将所有人物/物体组合在同一个画面中，保持和谐的比例和透视" },
      { label: "风格迁移", cmd: "保持【主体】的结构，应用【风格】图的艺术效果" },
      { label: "场景融合", cmd: "将【主体】完美融入【背景】图中，注意光影和透视统一" },
  ];

  return (
    <div ref={containerRef} className="space-y-6 animate-fade-in outline-none" tabIndex={0}>
        
        {/* Horizontal Image Slot Queue with Batch Actions */}
        <div 
            className="obsidian-card p-4 sm:p-6 rounded-3xl border border-purple-500/20 shadow-[0_0_30px_rgba(0,0,0,0.3)] relative overflow-hidden"
            onClick={(e) => {
                // Click on background deselects all
                if (e.target === e.currentTarget) {
                    setSelectedIds(new Set());
                    setLastSelectedIndex(null);
                }
            }}
        >
            {/* Drag Overlay */}
            {isDraggingOver && (
                <div className="absolute inset-0 z-50 bg-purple-600/30 backdrop-blur-sm border-2 border-dashed border-purple-400 flex flex-col items-center justify-center animate-pulse pointer-events-none">
                    <UploadIcon className="text-6xl text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.8)]" />
                    <p className="text-2xl font-black text-white mt-4">松手！把它们交给我！</p>
                </div>
            )}

            <div className="flex justify-between items-center mb-6 flex-wrap gap-2 pointer-events-none">
                <h3 className="text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-200 to-white flex items-center gap-2 pointer-events-auto">
                    <span className="flex items-center gap-2"><span className="text-xl">🛠️</span> 智能合成工作台</span>
                    <span className="text-xs text-gray-400 font-normal">({imageSlots.filter(s => s.file).length}/{MAX_IMAGES})</span>
                </h3>
                
                {selectedIds.size > 0 && (
                    <div className="flex items-center gap-2 animate-fade-in bg-purple-900/60 border border-purple-500/30 rounded-lg p-1.5 shadow-lg pointer-events-auto">
                        <span className="text-xs font-bold text-white px-2">已选 {selectedIds.size} 张:</span>
                        <div className="flex gap-1">
                            <button onClick={() => handleBatchRole('subject')} title="设为主体" className="p-1.5 rounded bg-yellow-500/80 hover:bg-yellow-400 text-white text-[10px]">👑</button>
                            <button onClick={() => handleBatchRole('element')} title="设为素材" className="p-1.5 rounded bg-green-500/80 hover:bg-green-400 text-white text-[10px]">🧩</button>
                            <button onClick={() => handleBatchRole('background')} title="设为背景" className="p-1.5 rounded bg-blue-500/80 hover:bg-blue-400 text-white text-[10px]">🖼️</button>
                            <button onClick={() => handleBatchRole('style')} title="设为风格" className="p-1.5 rounded bg-pink-500/80 hover:bg-pink-400 text-white text-[10px]">✨</button>
                            <div className="w-[1px] h-4 bg-white/20 mx-1"></div>
                            <button onClick={handleBatchDelete} title="删除选中" className="p-1.5 rounded bg-red-600/80 hover:bg-red-500 text-white"><TrashIcon className="text-xs"/></button>
                        </div>
                    </div>
                )}
            </div>
            
            <div 
                className="flex flex-wrap items-start gap-3 pb-4 min-h-[160px]"
                onDragOver={handleContainerDragOver}
                onDrop={handleContainerDrop}
                onDragLeave={handleContainerDragLeave}
                onClick={(e) => {
                     // Ensure clicking the gap between items also deselects
                     if (e.target === e.currentTarget) {
                        setSelectedIds(new Set());
                        setLastSelectedIndex(null);
                     }
                }}
            >
               {imageSlots.map((slot, index) => (
                  <ImageSlotCard 
                    key={slot.id} 
                    slot={slot}
                    index={index}
                    onUpload={(files) => processFilesToAdd(files, index)}
                    onRemove={() => handleRemoveSlot(index)}
                    onRoleChange={(role) => handleRoleChange(index, role)}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleSortDrop}
                    canRemove={imageSlots.length > 0}
                    isSelected={selectedIds.has(slot.id)}
                    onClick={(e) => handleSlotClick(e, index)}
                  />
               ))}

               {/* Add Button */}
               {imageSlots.length < MAX_IMAGES && (
                  <label
                     className="w-24 h-40 sm:w-28 sm:h-44 rounded-2xl border-2 border-dashed border-white/10 bg-white/5 hover:bg-purple-600/20 hover:border-purple-500/50 hover:shadow-[0_0_20px_rgba(168,85,247,0.15)] transition-all flex flex-col items-center justify-center text-gray-400 hover:text-purple-300 gap-2 group flex-shrink-0 animate-fade-in cursor-pointer"
                     title="点击添加或拖拽文件到这里"
                     onClick={(e) => e.stopPropagation()} 
                  >
                     <span className="text-3xl font-light group-hover:scale-110 transition-transform bg-white/10 rounded-full w-10 h-10 flex items-center justify-center">+</span>
                     <span className="text-xs font-bold uppercase tracking-wider text-center px-1">Add Image</span>
                     <input 
                        type="file" 
                        className="hidden" 
                        accept="image/*"
                        multiple // Global Add Button supports multiple
                        onChange={(e) => {
                            if (e.target.files && e.target.files.length > 0) {
                                processFilesToAdd(e.target.files);
                            }
                            e.target.value = ''; // Reset input
                        }}
                    />
                  </label>
               )}
            </div>
            
            <div className="mt-2 text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                <InfoIcon className="text-purple-400"/>
                <span>提示：上传带尺寸/数量标注的图片，AI会自动识别比例哦！ | 按住 <strong className="text-purple-400">Ctrl</strong> 加选，<strong className="text-purple-400">Shift</strong> 连选。</span>
            </div>
        </div>

        {/* Text Input Area */}
        <div className="obsidian-card p-6 sm:p-8 group rounded-3xl">
            <label htmlFor="keywords" className="block text-lg sm:text-xl font-black mb-4 text-transparent bg-clip-text bg-gradient-to-r from-purple-200 to-white group-hover:from-purple-300 group-hover:to-purple-100 transition-colors">
                合成指令 (AI 拥有鹰眼视觉，可识别图中文字标注！)
            </label>
            <div className="relative">
            <textarea
                id="keywords"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="例如：把【素材】挂在【主体】上；或者把【主体】放到【背景】里... (AI会自动读取图片中的尺寸，如15cm, 90cm等)"
                className="w-full h-40 p-4 sm:p-5 pr-16 bg-black/40 border border-white/10 rounded-2xl focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all placeholder-gray-500 resize-none text-gray-200 shadow-inner backdrop-blur-sm"
            />
                <div className="absolute top-3 right-3 flex flex-col gap-2">
                <button
                    onClick={onShowKeywordsHelper}
                    title="查看魔咒说明"
                    className="p-2 sm:p-2.5 rounded-full bg-white/5 hover:bg-purple-600 text-purple-300 hover:text-white transition-all duration-300 border border-white/10 hover:shadow-[0_0_15px_rgba(168,85,247,0.6)]"
                >
                    <InfoIcon className="text-xl"/>
                </button>
                </div>
            </div>

            {/* Quick Spells */}
            <div className="mt-6">
                <p className="text-xs sm:text-sm font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <MagicWandIcon /> 智能逻辑指令 (点击应用):
                </p>
                <div className="flex flex-wrap gap-2">
                    {quickSpells.map((spell, idx) => (
                        <button
                            key={idx}
                            onClick={() => setKeywords(spell.cmd)}
                            className="px-3 py-2 text-xs font-bold text-purple-200 bg-purple-900/30 border border-purple-500/20 rounded-lg hover:bg-purple-600 hover:text-white hover:shadow-[0_0_15px_rgba(168,85,247,0.4)] transition-all duration-200 hover:-translate-y-0.5 text-left"
                            title={spell.cmd}
                        >
                            {spell.label}
                        </button>
                    ))}
                    {['精修融合边界', '统一环境光', '保持原图构图', '电影级质感'].map((k) => (
                         <button
                            key={k}
                            onClick={() => setKeywords(prev => prev ? `${prev}, ${k}` : k)}
                            className="px-3 py-2 text-xs font-bold text-gray-400 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 hover:text-white transition-all"
                        >
                            + {k}
                        </button>
                    ))}
                </div>
            </div>
            
            {error && <p className="text-sm text-red-400 mt-3 font-bold bg-red-900/20 p-2 rounded-lg text-center animate-pulse">{error}</p>}
            
            <div className="flex flex-col sm:flex-row gap-4 mt-8">
                 {/* Direct Generation Button */}
                 <button
                    onClick={handleDirectGenerate}
                    disabled={isLoading || isDirectLoading || isCooldown || apiPointsUsed >= KUROMI_MAGIC_POINTS}
                    className="flex-1 flex items-center justify-center gap-2 py-4 px-6 bg-gradient-to-r from-pink-600 to-rose-600 rounded-2xl font-extrabold text-lg text-white shadow-[0_0_20px_rgba(236,72,153,0.4)] hover:shadow-[0_0_35px_rgba(236,72,153,0.7)] hover:scale-[1.02] active:scale-[0.99] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none border border-pink-400/30 group relative overflow-hidden"
                >
                     <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500 skew-x-12"></div>
                     {isDirectLoading ? (
                        <>
                            <LoadingIcon className="w-5 h-5" />
                            <span>极速绘制中...</span>
                        </>
                     ) : (
                        <>
                            <SparklesIcon className="text-xl" />
                            <span>立即生图 (极速版)</span>
                        </>
                     )}
                </button>

                {/* Standard Prompt Gen Button */}
                <button
                    onClick={handleGenerate}
                    disabled={isLoading || isDirectLoading || isCooldown || apiPointsUsed >= KUROMI_MAGIC_POINTS}
                    className="flex-[2] flex items-center justify-center gap-2 py-4 px-6 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl font-extrabold text-lg text-white shadow-[0_0_25px_rgba(147,51,234,0.4)] hover:shadow-[0_0_40px_rgba(147,51,234,0.7)] hover:scale-[1.01] active:scale-[0.99] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none border border-purple-400/30 group relative overflow-hidden"
                >
                    <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 skew-x-12"></div>
                    {isLoading ? (
                        <>
                            <LoadingIcon className="w-6 h-6" />
                            <span className="text-lg">解析尺寸与逻辑...</span>
                        </>
                    ) : apiPointsUsed >= KUROMI_MAGIC_POINTS ? (
                        `魔力耗尽啦！ (${timeRemaining}s)`
                    ) : (
                        <>
                            <GenerateIcon className="text-2xl" />
                            {isCooldown ? '冷却中...' : '开始智能合成 (生成提示词)'}
                        </>
                    )}
                </button>
            </div>
            
        </div>
    </div>
  );
};
