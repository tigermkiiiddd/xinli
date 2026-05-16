import React from 'react';
import { X, Brain, Search, Database, Trash } from 'lucide-react';
import { db, type MemoryEntry } from '../../db';

interface MemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  memories: MemoryEntry[];
  memorySearchTerm: string;
  setMemorySearchTerm: (term: string) => void;
}

export const MemoryModal: React.FC<MemoryModalProps> = ({
  isOpen,
  onClose,
  memories,
  memorySearchTerm,
  setMemorySearchTerm
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm fade-in">
      <div className="bg-[#F9F8F6] rounded-2xl w-full max-w-4xl overflow-hidden shadow-xl border border-[#E5E1D8] flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-[#E5E1D8] flex justify-between items-center bg-white">
          <div className="flex items-center gap-3">
            <Brain className="w-6 h-6 text-[#5A5A40]" />
            <h3 className="font-serif italic font-semibold text-[#5A5A40] text-xl">长期记忆库 (Memory Bank)</h3>
          </div>
          <button onClick={onClose} className="text-[#8E8B82] hover:text-[#2D2926] p-1 rounded-md hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 bg-[#F2EFE9] border-b border-[#E5E1D8] flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A6A298]" />
            <input
              type="text"
              placeholder="搜索记忆条目..."
              value={memorySearchTerm}
              onChange={(e) => setMemorySearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-[#E5E1D8] rounded-xl text-sm focus:outline-none focus:border-[#5A5A40] shadow-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-[#F9F8F6]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {memories
              .filter(m => m.content.toLowerCase().includes(memorySearchTerm.toLowerCase()) || m.category.toLowerCase().includes(memorySearchTerm.toLowerCase()))
              .map(memory => (
                <div key={memory.id} className="bg-white border border-[#E5E1D8] rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow group relative">
                  <div className="flex justify-between items-start mb-3">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${memory.category === 'Trauma' ? 'bg-red-50 text-red-600 border border-red-100' :
                        memory.category === 'Growth' ? 'bg-green-50 text-green-600 border border-green-100' :
                          'bg-blue-50 text-blue-600 border border-blue-100'
                      }`}>
                      {memory.category}
                    </span>
                    <button
                      onClick={() => db.memories.delete(memory.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-[#A6A298] hover:text-red-500 rounded-md hover:bg-red-50"
                    >
                      <Trash className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="text-[#2D2926] text-sm leading-relaxed mb-4 font-medium">
                    {memory.content}
                  </div>
                  <div className="space-y-2 border-t border-[#F5F5F0] pt-3">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-[#A6A298] font-bold uppercase tracking-tighter">成立前提</span>
                      <span className="text-xs text-[#5A5A40] italic">{memory.prerequisite || '未明确'}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-[#A6A298] font-bold uppercase tracking-tighter">作用领域</span>
                      <span className="text-xs text-[#5A5A40] italic">{memory.domain || '未明确'}</span>
                    </div>
                  </div>
                  <div className="mt-4 text-[10px] text-[#A6A298] text-right">
                    更新于: {new Date(memory.updatedAt).toLocaleString()}
                  </div>
                </div>
              ))}
            {memories.length === 0 && (
              <div className="col-span-full py-20 text-center text-[#A6A298]">
                <Database className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>目前还没有长期记忆条目</p>
                <p className="text-xs mt-1">对话结束后会自动通过 Re-Act Agent 进行归档整理</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
