import React from 'react';
import { Menu, Database } from 'lucide-react';
import { type Chat, type AppSettings } from '../../db';

interface HeaderProps {
  onMenuClick: () => void;
  onMentorClick: () => void;
  settingsForm: AppSettings;
  activeChat: Chat | null;
  onArchiveClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onMenuClick,
  onMentorClick,
  settingsForm,
  activeChat,
  onArchiveClick
}) => {
  const lastUsage = activeChat?.messages
    ?.filter(m => m.role === 'assistant' && m.usage)
    .slice(-1)[0]?.usage;

  return (
    <header className="h-16 border-b border-[#F0EDE8] flex items-center px-8 bg-white/80 backdrop-blur-sm shrink-0 z-10">
      <button
        className="md:hidden mr-3 p-2 text-[#8E8B82] hover:text-[#5A5A40] transition-colors"
        onClick={onMenuClick}
      >
        <Menu className="w-5 h-5" />
      </button>
      <div className="flex-1 flex items-center gap-3 cursor-pointer group" onClick={onMentorClick}>
        <div className="relative">
          {settingsForm.assistantAvatar ? (
            <img src={settingsForm.assistantAvatar} alt="Mentor" className="w-8 h-8 rounded-full object-cover border border-[#E5E1D8] group-hover:border-[#5A5A40] transition-colors" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-[#5A5A40] flex items-center justify-center text-white text-xs font-serif italic group-hover:bg-[#4A4A35] transition-colors">
              {settingsForm.assistantName?.charAt(0) || '心'}
            </div>
          )}
          <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full"></div>
        </div>
        <div>
          <h2 className="text-lg font-serif italic text-[#2D2926] group-hover:text-[#5A5A40] transition-colors">{settingsForm.assistantName || 'AI 心理咨询师'}</h2>
          <p className="text-[10px] text-[#A6A298] uppercase tracking-widest mt-0.5">
            {activeChat?.isArchived ? '本对话已归档为长期记忆' : '点击头像以自定义我的设定'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {lastUsage && !activeChat?.isArchived && (
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-[#FAF9F6] border border-[#F0EDE8] rounded-full text-[10px] text-[#A6A298] mr-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
            <span>上下文: {lastUsage.promptTokens}</span>
          </div>
        )}

        {activeChat && !activeChat.isArchived && activeChat.messages.length > 0 && (
          <button
            onClick={onArchiveClick}
            className="flex items-center gap-2 px-3 py-1.5 bg-[#F5F5F0] hover:bg-[#EAE6DD] text-[#5A5A40] rounded-xl text-xs font-semibold transition-all border border-[#E5E1D8]"
          >
            <Database className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">手动归档</span>
          </button>
        )}
      </div>
    </header>
  );
};
