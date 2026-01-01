import React, { useState, useCallback, useRef } from 'react';
import { UploadIcon } from './icons';

interface MultiImageUploaderProps {
  onImageUpload: (files: File[]) => void;
  title: string;
}

interface ImagePreview {
  file: File;
  url: string;
}

export const MultiImageUploader: React.FC<MultiImageUploaderProps> = ({ onImageUpload, title }) => {
  const [previews, setPreviews] = useState<ImagePreview[]>([]);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateParent = (updatedPreviews: ImagePreview[]) => {
    const files = updatedPreviews.map(p => p.file);
    onImageUpload(files);
  };

  const handleFileChange = useCallback((files: FileList | null) => {
    if (!files) return;
    const newPreviews: ImagePreview[] = [];
    const filesArray = Array.from(files);

    const processFile = (file: File) => {
        if (file.type.startsWith('image/')) {
            return new Promise<ImagePreview>(resolve => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    resolve({ file, url: reader.result as string });
                };
                reader.readAsDataURL(file);
            });
        }
        return Promise.resolve(null);
    }

    Promise.all(filesArray.map(processFile)).then(results => {
        const validResults = results.filter(r => r !== null) as ImagePreview[];
        setPreviews(prev => {
            const updated = [...prev, ...validResults];
            updateParent(updated);
            return updated;
        });
    });
  }, []);

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

  const handleRemove = (indexToRemove: number) => {
    setPreviews(prev => {
        const updated = prev.filter((_, index) => index !== indexToRemove);
        updateParent(updated);
        return updated;
    });
  };

  return (
    <div className="obsidian-card p-6 focus:outline-none transition-all group">
      <p className="text-xl font-black mb-5 text-transparent bg-clip-text bg-gradient-to-r from-purple-200 to-white group-hover:from-purple-300 group-hover:to-purple-100 transition-all">{title}</p>
      
      {previews.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4 mb-6 animate-fade-in">
            {previews.map((p, index) => (
                <div key={index} className="relative group/img aspect-square bg-black/40 p-1.5 rounded-xl overflow-visible hover:scale-105 transition-transform border border-white/10">
                    <img src={p.url} alt={`上传图片预览 ${index + 1}`} className="w-full h-full object-cover rounded-lg shadow-md" />
                    <button 
                        onClick={() => handleRemove(index)}
                        className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-all transform hover:scale-110 shadow-lg border border-white/20"
                        aria-label={`移除图片 ${index + 1}`}
                    >
                        ×
                    </button>
                </div>
            ))}
        </div>
      )}

      <label
        htmlFor={`multi-image-upload`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`relative flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-300
          ${isDragging 
            ? 'border-purple-500 bg-purple-900/20 shadow-[0_0_30px_rgba(168,85,247,0.3)] scale-[1.01]' 
            : 'border-white/10 hover:border-purple-400/60 hover:bg-white/5'}`}
      >
        <div className="text-center text-gray-400 pointer-events-none flex flex-col items-center gap-3">
            <div className={`p-3 rounded-full border border-white/10 shadow-inner transition-transform duration-300 ${isDragging ? 'bg-purple-500/20 scale-110' : 'bg-white/5'}`}>
                <UploadIcon className="text-3xl" />
            </div>
            <p className="font-bold text-gray-300">快！把更多的宝贝图丢进来！</p>
        </div>
        <input
          id={`multi-image-upload`}
          type="file"
          className="hidden"
          accept="image/*"
          multiple
          ref={fileInputRef}
          onChange={(e) => handleFileChange(e.target.files)}
        />
      </label>
    </div>
  );
};
