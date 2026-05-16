import React from 'react';
import { Sparkles, X, Plus, MessageSquare, Database, Trash2, Brain, Settings, UserCircle } from 'lucide-react';
import { db, type Chat, type UserProfile, type AppSettings } from '../../db';
import { AgentService } from '../../services/agentService';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  chats: Chat[];
  activeChatId: string | null;
  setActiveChatId: (id: string | null) => void;
  createNewChat: () => void;
  deleteChat: (e: React.MouseEvent, id: string) => void;
  userProfileData?: UserProfile;
  settingsData?: AppSettings;
  setIsMemoryOpen: (isOpen: boolean) => void;
  setIsSettingsOpen: (isOpen: boolean) => void;
  setIsProfileOpen: (isOpen: boolean) => void;
  setIsLoading: (loading: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  setIsOpen,
  chats,
  activeChatId,
  setActiveChatId,
  createNewChat,
  deleteChat,
  userProfileData,
  settingsData,
  setIsMemoryOpen,
  setIsSettingsOpen,
  setIsProfileOpen,
  setIsLoading
}) => {
  return (
    <>
      {/* Mobile Sidebar Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-20 md:hidden transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-30 w-72 bg-[#F2EFE9] border-r border-[#E5E1D8] transform transition-transform duration-300 ease-in-out flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          }`}
      >
        <div className="p-6 border-b border-[#E5E1D8] flex items-center justify-between">
          <div className="flex flex-col">
            <h1 className="text-2xl font-serif italic font-semibold text-[#5A5A40] mb-2 flex items-center gap-2">
              <Sparkles className="w-6 h-6" />
              心语
            </h1>
            <p className="text-[10px] uppercase tracking-widest text-[#8E8B82] font-semibold">专业心理咨询助手</p>
          </div>
          <button
            className="md:hidden text-[#8E8B82] hover:text-[#5A5A40]"
            onClick={() => setIsOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 mb-4 mt-4">
          <button
            onClick={createNewChat}
            className="w-full py-3 bg-[#5A5A40] text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 shadow-sm hover:bg-[#4A4A35] transition-colors"
          >
            <Plus className="w-4 h-4" />
            开启新对话
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 space-y-1">
          <div className="px-3 py-2 text-[11px] font-bold text-[#A6A298] uppercase tracking-tighter">最近对话</div>
          {chats.sort((a, b) => b.updatedAt - a.updatedAt).map(chat => (
            <div
              key={chat.id}
              onClick={() => {
                setActiveChatId(chat.id);
                if (window.innerWidth < 768) setIsOpen(false);
              }}
              className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${activeChatId === chat.id
                  ? 'bg-white border border-[#E5E1D8] shadow-sm'
                  : 'hover:bg-[#EAE6DD]'
                }`}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <MessageSquare className={`min-w-4 h-4 ${activeChatId === chat.id ? 'text-[#5A5A40]' : 'text-[#8E8B82]'
                  }`} />
                <span className={`truncate text-sm font-medium ${activeChatId === chat.id ? 'text-[#2D2926]' : 'text-[#2D2926]'} flex items-center gap-1.5`}>
                  {chat.isArchived && <Database className="w-3 h-3 text-[#A6A298] shrink-0" />}
                  {chat.title}
                </span>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {!chat.isArchived && chat.messages.length > 0 && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (settingsData) {
                        const agent = new AgentService(settingsData, userProfileData);
                        setIsLoading(true);
                        await agent.archiveChat(chat);
                        setIsLoading(false);
                      }
                    }}
                    className="text-[#A6A298] hover:text-[#5A5A40] p-1 rounded hover:bg-[#D9D4C7]"
                    title="归档对话"
                  >
                    <Database className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={(e) => deleteChat(e, chat.id)}
                  className={`text-[#A6A298] hover:text-red-500 p-1 rounded hover:bg-red-50 ${chats.length === 1 ? 'hidden' : ''
                    }`}
                  title="删除对话"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-[#E5E1D8] bg-[#EAE6DD] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#D9D4C7] border border-[#C5C0B3] flex items-center justify-center font-serif text-lg text-[#5A5A40]">理</div>
            <div className="flex-1">
              <div className="text-sm font-semibold">{userProfileData?.nickname || '我的档案'}</div>
              <div className="text-[10px] text-[#8E8B82] flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> 咨询模式活跃
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMemoryOpen(true)}
              className="p-2 text-[#8E8B82] hover:text-[#5A5A40] hover:bg-[#D9D4C7] rounded-lg transition-colors"
              title="长期记忆库"
            >
              <Brain className="w-5 h-5" />
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 text-[#8E8B82] hover:text-[#5A5A40] hover:bg-[#D9D4C7] rounded-lg transition-colors"
              title="设置"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button
              onClick={() => setIsProfileOpen(true)}
              className="p-2 text-[#8E8B82] hover:text-[#5A5A40] hover:bg-[#D9D4C7] rounded-lg transition-colors"
              title="个人档案设置"
            >
              <UserCircle className="w-5 h-5" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
