import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Edit2, RefreshCcw, Check } from 'lucide-react';
import { type Message, type AppSettings } from '../../db';

interface MessageItemProps {
  message: Message;
  settingsForm: AppSettings;
  editingMessageId: string | null;
  editText: string;
  setEditText: (text: string) => void;
  isLoading: boolean;
  onEdit: (messageId: string, content: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (messageId: string) => void;
  onRegenerate: (messageId: string) => void;
  onAvatarClick: () => void;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  settingsForm,
  editingMessageId,
  editText,
  setEditText,
  isLoading,
  onEdit,
  onCancelEdit,
  onSaveEdit,
  onRegenerate,
  onAvatarClick
}) => {
  if (message.role === 'system') {
    return (
      <div className="flex justify-center my-6 w-full fade-in">
        <div className="max-w-[85%] bg-[#F5F5F0]/80 backdrop-blur-sm border border-[#E5E1D8] rounded-2xl px-6 py-4 text-center">
          <div className="markdown-body text-[#4A463F] text-sm leading-relaxed text-left">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
          <div className="mt-2 text-[10px] text-[#A6A298] font-mono tracking-wider uppercase">系统自动压缩反馈</div>
        </div>
      </div>
    );
  }

  const isEditing = editingMessageId === message.id && message.role === 'user';
  const isUser = message.role === 'user';

  const avatarNode = isUser ? (
    settingsForm.userAvatar ? (
      <img src={settingsForm.userAvatar} alt="User" className="w-8 h-8 md:w-9 md:h-9 rounded-xl flex-shrink-0 object-cover shadow-sm" />
    ) : (
      <div className="w-8 h-8 md:w-9 md:h-9 rounded-xl bg-[#D9D4C7] flex-shrink-0 flex items-center justify-center text-[#5A5A40] font-bold shadow-sm text-sm">
        用
      </div>
    )
  ) : (
    <button
      onClick={onAvatarClick}
      className="flex-shrink-0 transition-transform active:scale-95"
      title="点击编辑导师信息"
    >
      {settingsForm.assistantAvatar ? (
        <img src={settingsForm.assistantAvatar} alt="Assistant" className="w-8 h-8 md:w-9 md:h-9 rounded-xl object-cover shadow-sm border border-transparent hover:border-[#5A5A40]" />
      ) : (
        <div className="w-8 h-8 md:w-9 md:h-9 rounded-xl bg-[#5A5A40] flex items-center justify-center text-white font-serif italic shadow-sm hover:bg-[#4A4A35] text-sm">
          {settingsForm.assistantName?.charAt(0) || '心'}
        </div>
      )}
    </button>
  );

  return (
    <div
      className={`fade-in group w-full flex flex-col md:gap-4 ${
        isUser
          ? 'md:flex-row-reverse md:ml-auto md:max-w-[80%]'
          : 'md:flex-row md:max-w-[80%]'
      }`}
    >
      <div className={`flex flex-shrink-0 mb-1.5 md:mb-0 md:mt-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
        {avatarNode}
      </div>

      {isEditing ? (
        <div className={`w-full max-md:w-[calc(100%-1.25rem)] md:flex-1 flex flex-col gap-2 relative md:max-w-none ${isUser ? 'max-md:ml-auto' : ''}`}>
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="w-full bg-white border border-[#5A5A40] rounded-xl p-3 text-sm text-[#2D2926] focus:outline-none focus:ring-2 focus:ring-[#5A5A40]/20 resize-none min-h-[80px]"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={onCancelEdit}
              className="px-3 py-1.5 text-xs text-[#5A5A40] bg-[#F5F5F0] hover:bg-[#EAE6DD] rounded-md transition-colors"
            >
              取消
            </button>
            <button
              onClick={() => onSaveEdit(message.id)}
              className="px-3 py-1.5 text-xs text-white bg-[#5A5A40] hover:bg-[#4A4A35] rounded-md transition-colors flex items-center gap-1"
            >
              <Check className="w-3 h-3" /> 保存并重新发送
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`flex flex-col min-w-0 w-full max-md:w-[calc(100%-1.25rem)] md:flex-1 ${
            isUser ? 'items-end max-md:ml-auto md:items-end' : 'items-start md:items-start'
          }`}
        >
          <div
            className={`w-full p-3.5 md:p-4 shadow-sm border rounded-2xl ${
              isUser
                ? 'bg-white border-[#E5E1D8] text-[#2D2926] rounded-tr-none'
                : 'bg-[#F5F5F0] border-[#E5E1D8] text-[#4A463F] rounded-tl-none'
            }`}
          >
            {message.role === 'assistant' ? (
              <div className="flex flex-col gap-2">
                {message.emotion && !message.emotion.includes('未识别') && !message.emotion.includes('中性') && (
                  <div className="text-[10px] text-[#A6A298] flex items-center gap-1 font-medium bg-white w-max px-2.5 py-1 rounded border border-[#E5E1D8]">
                    ✨ 据情绪感知：{message.emotion}
                  </div>
                )}
                <div className="markdown-body text-[#4A463F]">
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>
              </div>
            ) : (
              <div className="whitespace-pre-wrap leading-relaxed text-[0.95rem] text-[#2D2926] break-words">
                {message.content}
              </div>
            )}
          </div>

          {/* Action buttons & Info */}
          <div className={`flex flex-col gap-1 w-full ${isUser ? 'items-end' : 'items-start'}`}>
            <div className="flex mt-1 gap-1">
              {message.role === 'user' && !isLoading && (
                <button
                  onClick={() => onEdit(message.id, message.content)}
                  className="opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity p-2 md:p-1 text-[#A6A298] hover:text-[#5A5A40]"
                  title="编辑"
                >
                  <Edit2 className="w-4 h-4 md:w-3.5 md:h-3.5" />
                </button>
              )}
              {message.role === 'assistant' && !isLoading && (
                <button
                  onClick={() => onRegenerate(message.id)}
                  className="opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity p-2 md:p-1 text-[#A6A298] hover:text-[#5A5A40]"
                  title="重新生成"
                >
                  <RefreshCcw className="w-4 h-4 md:w-3.5 md:h-3.5" />
                </button>
              )}
            </div>

            {message.role === 'assistant' && message.usage && (
              <div className="text-[10px] text-[#A6A298] ml-1 bg-white/50 px-2 py-0.5 rounded-full border border-[#E5E1D8]/50 flex gap-2 w-max">
                <span className="font-medium">Context Token: {message.usage.promptTokens}</span>
                <span className="opacity-60">| 生成: {message.usage.completionTokens} | 总计: {message.usage.totalTokens}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
