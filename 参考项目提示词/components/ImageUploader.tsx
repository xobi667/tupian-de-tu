
import React, { useState, useCallback, useRef } from 'react';
import { UploadIcon } from './icons';

interface ImageUploaderProps {
  onImageUpload: (file: File) => void;
  title: string;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageUpload, title }) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const handleFileChange = useCallback((files: FileList | null) => {
    if (files && files[0]) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        onImageUpload(file);
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreview(reader.result as string);
        };
        reader.readAsDataURL(file);
      }
    }
  }, [onImageUpload]);

  const onDragOver = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  
  const onDragLeave = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileChange(e.dataTransfer.files);
  }, [handleFileChange]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);
          handleFileChange(dataTransfer.files);
          e.preventDefault();
          break;
        }
      }
    }
  }, [handleFileChange]);

  return (
    <div
      ref={rootRef}
      onPaste={handlePaste}
      tabIndex={0}
      className="obsidian-card p-5 sm:p-6 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all group"
      aria-label={`${title}。点击上传、拖拽或粘贴图片。`}
    >
      <p className="text-base sm:text-lg font-black mb-5 text-transparent bg-clip-text bg-gradient-to-r from-purple-200 to-white group-hover:from-purple-300 group-hover:to-purple-100 transition-all whitespace-pre-line leading-snug">{title}</p>
      <label
        htmlFor={`image-upload-${title}`}
        onClick={() => rootRef.current?.focus()}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`relative flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-500 overflow-hidden
          ${isDragging 
            ? 'border-purple-500 bg-purple-900/20 scale-[1.02] shadow-[0_0_30px_rgba(168,85,247,0.3)]' 
            : 'border-white/10 hover:border-purple-400/60 hover:bg-white/5'}`}
      >
        {preview ? (
          <>
            <div className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 transition-opacity duration-300 flex items-center justify-center z-10 backdrop-blur-sm">
               <p className="text-white font-bold bg-purple-600/90 px-6 py-3 rounded-full border border-white/20 shadow-xl transform scale-90 hover:scale-100 transition-transform">
                 更换图片 🔄
               </p>
            </div>
            <img src={preview} alt="上传图片预览" className="object-contain w-full h-full p-4 drop-shadow-2xl" />
          </>
        ) : (
          <div className="text-center text-gray-400 pointer-events-none z-10 flex flex-col items-center gap-4">
            <div className={`p-4 rounded-full border border-white/10 shadow-inner transition-transform duration-500 ${isDragging ? 'bg-purple-500/20 scale-125 rotate-12' : 'bg-white/5'}`}>
                <UploadIcon className="text-4xl" />
            </div>
            <div className="space-y-1">
                <p className="font-extrabold text-gray-200 text-lg tracking-wide">快把图丢进来！</p>
                <p className="text-xs text-purple-300/70">点一下、拖过来、或者直接粘贴</p>
            </div>
          </div>
        )}
        <input
          id={`image-upload-${title}`}
          type="file"
          className="hidden"
          accept="image/*"
          onChange={(e) => handleFileChange(e.target.files)}
        />
      </label>
    </div>
  );
};
