
import React, { useState, useEffect, useMemo } from 'react';
import { HistoryRecord } from '../types';
import { historyService } from '../services/historyService';
import { PromptDisplay } from './PromptDisplay';
import { CloseIcon, FolderIcon, TrashIcon, EditIcon, CalendarIcon, SkullIcon } from './icons';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({ isOpen, onClose }) => {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<HistoryRecord | null>(null);
  const [isEditingFolder, setIsEditingFolder] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadRecords();
    }
  }, [isOpen]);

  const loadRecords = async () => {
    const data = await historyService.getAllRecords();
    setRecords(data);
    // Default to the most recent folder if none selected, or first one available
    if (!selectedFolder && data.length > 0) {
        setSelectedFolder(data[0].folderName);
    }
  };

  const folders = useMemo(() => {
    const names = Array.from(new Set(records.map(r => r.folderName)));
    return names.sort((a: string, b: string) => b.localeCompare(a)); // Date sort descending
  }, [records]);

  const filteredRecords = useMemo(() => {
    return records.filter(r => r.folderName === selectedFolder);
  }, [records, selectedFolder]);

  const handleDeleteRecord = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('确定要删除这条充满魔力的记录吗？')) {
      await historyService.deleteRecord(id);
      loadRecords();
      if (selectedRecord?.id === id) setSelectedRecord(null);
    }
  };

  const handleDeleteFolder = async (folderName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`确定要销毁 "${folderName}" 文件夹里的所有记忆吗？这可是不可逆的魔法！`)) {
        await historyService.deleteFolder(folderName);
        setRecords(prev => prev.filter(r => r.folderName !== folderName));
        if (selectedFolder === folderName) setSelectedFolder(null);
    }
  };

  const handleRenameStart = (folderName: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setIsEditingFolder(folderName);
      setNewFolderName(folderName);
  };

  const handleRenameSubmit = async (oldName: string) => {
      if (newFolderName && newFolderName !== oldName) {
          await historyService.renameFolder(oldName, newFolderName);
          await loadRecords();
          if (selectedFolder === oldName) setSelectedFolder(newFolderName);
      }
      setIsEditingFolder(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-xl animate-fade-in">
        <div className="w-full h-full max-w-[95vw] max-h-[90vh] obsidian-card flex flex-col sm:flex-row overflow-hidden border-purple-500/30 shadow-2xl relative">
            <button onClick={onClose} className="absolute top-4 right-4 z-50 text-gray-400 hover:text-white bg-black/50 rounded-full p-2 hover:bg-red-500/20 transition-all">
                <CloseIcon className="text-2xl" />
            </button>

            {/* Left Sidebar: Folders */}
            <div className="w-full sm:w-64 md:w-80 bg-black/40 border-r border-white/10 flex flex-col p-4 overflow-y-auto custom-scrollbar">
                <div className="mb-6 px-2">
                    <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-300 to-pink-300 flex items-center gap-2">
                        <CalendarIcon /> 魔法史诗
                    </h2>
                    <p className="text-xs text-gray-500 mt-1">记录本小姐每一次的施法瞬间</p>
                </div>
                <div className="space-y-2">
                    {folders.length === 0 && <div className="text-gray-500 text-sm text-center py-10">暂无记录... 快去施法吧！</div>}
                    {folders.map(folder => (
                        <div 
                            key={folder} 
                            onClick={() => { setSelectedFolder(folder); setSelectedRecord(null); }}
                            className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border ${
                                selectedFolder === folder 
                                ? 'bg-purple-600/20 border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.2)]' 
                                : 'bg-white/5 border-transparent hover:bg-white/10'
                            }`}
                        >
                            {isEditingFolder === folder ? (
                                <input 
                                    autoFocus
                                    value={newFolderName}
                                    onChange={(e) => setNewFolderName(e.target.value)}
                                    onBlur={() => handleRenameSubmit(folder)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit(folder)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="bg-black/50 text-white text-sm rounded px-2 py-1 w-full outline-none border border-purple-500"
                                />
                            ) : (
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <FolderIcon className={`${selectedFolder === folder ? 'text-purple-300' : 'text-gray-400'}`} />
                                    <span className={`text-sm font-bold truncate ${selectedFolder === folder ? 'text-white' : 'text-gray-300'}`}>{folder}</span>
                                </div>
                            )}
                            
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={(e) => handleRenameStart(folder, e)} className="p-1.5 hover:bg-blue-500/20 rounded-md text-gray-400 hover:text-blue-300"><EditIcon /></button>
                                <button onClick={(e) => handleDeleteFolder(folder, e)} className="p-1.5 hover:bg-red-500/20 rounded-md text-gray-400 hover:text-red-300"><TrashIcon /></button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Middle: Record List (Grid) */}
            {!selectedRecord ? (
                <div className="flex-1 p-6 overflow-y-auto custom-scrollbar bg-gradient-to-br from-black/20 to-purple-900/5">
                    <div className="flex justify-between items-end mb-6 pb-4 border-b border-white/5">
                        <div>
                            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                {selectedFolder || '请选择文件夹'}
                                {selectedFolder && <span className="text-xs bg-purple-900/50 text-purple-200 px-2 py-0.5 rounded-full border border-purple-500/30">{filteredRecords.length} 条记录</span>}
                            </h3>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {filteredRecords.map(record => (
                            <div 
                                key={record.id}
                                onClick={() => setSelectedRecord(record)}
                                className="group relative aspect-[3/4] bg-black/40 rounded-xl border border-white/10 overflow-hidden cursor-pointer hover:border-purple-500/50 hover:shadow-[0_0_20px_rgba(168,85,247,0.3)] transition-all duration-300"
                            >
                                <div className="w-full h-2/3 bg-gray-900 relative">
                                    <img src={record.images.main} alt="Main" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                    {record.images.background && (
                                        <img src={record.images.background} alt="Bg" className="absolute bottom-2 right-2 w-8 h-8 rounded-md border border-white/30 shadow-md" />
                                    )}
                                    <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-[10px] px-2 py-1 rounded text-gray-300">
                                        {new Date(record.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                    </div>
                                    {/* Indicator if generated images exist */}
                                    {record.generatedImages && Object.keys(record.generatedImages).length > 0 && (
                                        <div className="absolute top-2 right-2 bg-purple-600/80 backdrop-blur-sm text-[10px] px-2 py-1 rounded text-white shadow-lg border border-purple-400/50">
                                            已生成
                                        </div>
                                    )}
                                </div>
                                <div className="p-3 h-1/3 flex flex-col justify-between bg-white/5">
                                    <div className="text-xs text-gray-400 line-clamp-2 font-mono leading-relaxed">
                                        {/* Try to display a snippet of the prompt */}
                                        {record.mode === 'single' 
                                            // @ts-ignore - safe access for preview
                                            ? (record.prompts.professional?.withText?.positive?.chinese || record.prompts.classic?.classic?.chinese || 'Prompt Data')
                                            // @ts-ignore
                                            : (record.prompts.fusionWithSubject?.detailed?.chinese || 'Fusion Data')
                                        }
                                    </div>
                                    <div className="flex justify-between items-center mt-2">
                                        <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${record.mode === 'single' ? 'bg-blue-900/30 text-blue-300' : 'bg-pink-900/30 text-pink-300'}`}>
                                            {record.mode === 'single' ? '单图' : '融合'}
                                        </span>
                                        <button 
                                            onClick={(e) => handleDeleteRecord(record.id, e)}
                                            className="text-gray-500 hover:text-red-400 p-1 hover:bg-red-500/10 rounded transition-colors"
                                        >
                                            <TrashIcon />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    {filteredRecords.length === 0 && selectedFolder && (
                        <div className="h-64 flex flex-col items-center justify-center text-gray-500 opacity-50">
                            <SkullIcon className="text-4xl mb-2" />
                            <p>这里空空如也...</p>
                        </div>
                    )}
                </div>
            ) : (
                // Right: Detail View
                <div className="flex-1 flex flex-col h-full bg-black/40">
                     <div className="p-4 border-b border-white/10 flex items-center gap-4 bg-black/20">
                        <button onClick={() => setSelectedRecord(null)} className="text-sm text-purple-300 hover:text-white hover:underline flex items-center gap-1">
                            ← 返回列表
                        </button>
                        <div className="h-4 w-[1px] bg-white/10"></div>
                        <span className="text-sm text-gray-400">
                            {new Date(selectedRecord.timestamp).toLocaleString()}
                        </span>
                     </div>
                     <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-8">
                         <div className="max-w-3xl mx-auto space-y-8">
                             <div className="flex justify-center gap-4">
                                 <div className="relative group">
                                    <img src={selectedRecord.images.main} className="max-h-64 rounded-xl shadow-lg border border-white/10" alt="Main Input" />
                                    <span className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded backdrop-blur-md">主图</span>
                                 </div>
                                 {selectedRecord.images.background && (
                                     <div className="relative group">
                                        <img src={selectedRecord.images.background} className="max-h-64 rounded-xl shadow-lg border border-white/10" alt="BG Input" />
                                        <span className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded backdrop-blur-md">参考图</span>
                                     </div>
                                 )}
                             </div>
                             <PromptDisplay 
                                prompts={selectedRecord.prompts} 
                                isLoading={false} 
                                logApiCall={() => {}} 
                                apiPointsUsed={0} 
                                timeRemaining={0} 
                                handleApiError={() => {}} 
                                generationContextImages={null} // Historical records don't support re-generation in this simplified view
                                recordId={selectedRecord.id}
                                savedGeneratedImages={selectedRecord.generatedImages}
                             />
                         </div>
                     </div>
                </div>
            )}
        </div>
    </div>
  );
};
