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
  const isEditing = editingMessageId === message.id && message.role === 'user';

  return (
    <div
      className={`flex gap-4 fade-in group ${message.role === 'user' ? 'flex-row-reverse ml-auto max-w-[80%]' : 'max-w-[80%]'}`}
    >
      {message.role === 'assistant' && (
        <button
          onClick={onAvatarClick}
          className="flex-shrink-0 transition-transform active:scale-95"
          title="点击编辑导师信息"
        >
          {settingsForm.assistantAvatar ? (
            <img src={settingsForm.assistantAvatar} alt="Assistant" className="w-9 h-9 rounded-xl object-cover mt-1 shadow-sm border border-transparent hover:border-[#5A5A40]" />
          ) : (
            <div className="w-9 h-9 rounded-xl bg-[#5A5A40] flex items-center justify-center text-white font-serif italic shadow-sm mt-1 hover:bg-[#4A4A35]">
              {settingsForm.assistantName?.charAt(0) || '心'}
            </div>
          )}
        </button>
      )}
      {message.role === 'user' && (
        settingsForm.userAvatar ? (
          <img src={settingsForm.userAvatar} alt="User" className="w-9 h-9 rounded-xl flex-shrink-0 object-cover mt-1 shadow-sm" />
        ) : (
          <div className="w-9 h-9 rounded-xl bg-[#D9D4C7] flex-shrink-0 flex items-center justify-center text-[#5A5A40] font-bold shadow-sm mt-1">
            用
          </div>
        )
      )}

      {isEditing ? (
        <div className="flex-1 w-full flex flex-col gap-2 relative mt-1">
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
        <div className="flex flex-col items-start min-w-0" style={{ alignItems: message.role === 'user' ? 'flex-end' : 'flex-start' }}>
          <div className={`rounded-2xl p-4 shadow-sm border ${message.role === 'user'
              ? 'bg-white border-[#E5E1D8] text-[#2D2926] rounded-tr-none'
              : 'bg-[#F5F5F0] border-[#E5E1D8] text-[#4A463F] rounded-tl-none'
            }`}>
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

          {/* Action buttons */}
          {message.role === 'user' && !isLoading && (
            <div className="flex mt-1 mr-1">
              <button
                onClick={() => onEdit(message.id, message.content)}
                className="opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity p-2 md:p-1 text-[#A6A298] hover:text-[#5A5A40]"
                title="编辑"
              >
                <Edit2 className="w-4 h-4 md:w-3.5 md:h-3.5" />
              </button>
            </div>
          )}
          {message.role === 'assistant' && !isLoading && (
            <div className="flex mt-1 ml-1">
              <button
                onClick={() => onRegenerate(message.id)}
                className="opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity p-2 md:p-1 text-[#A6A298] hover:text-[#5A5A40]"
                title="重新生成"
              >
                <RefreshCcw className="w-4 h-4 md:w-3.5 md:h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
