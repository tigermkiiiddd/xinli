import React from 'react';

interface ChatInputProps {
  inputMessage: string;
  setInputMessage: (message: string) => void;
  isLoading: boolean;
  onSendMessage: (e?: React.FormEvent) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  inputMessage,
  setInputMessage,
  isLoading,
  onSendMessage,
  onKeyDown
}) => {
  return (
    <div className="bg-white border-t border-[#F0EDE8] pt-4 pb-6 px-4 md:px-6 z-10">
      <div className="max-w-3xl mx-auto">
        <form
          onSubmit={onSendMessage}
          className="relative flex items-center bg-[#F9F8F6] rounded-2xl border border-[#E5E1D8] focus-within:border-[#5A5A40] transition-colors shadow-sm"
        >
          <textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="在这里输入你的想法..."
            className="w-full max-h-32 min-h-[56px] bg-transparent border-none focus:ring-0 resize-none py-4 pl-6 pr-24 text-sm text-[#2D2926] placeholder-[#A6A298] leading-relaxed custom-scrollbar"
            rows={1}
            style={{ height: '56px' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = '56px';
              target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
            }}
          />
          <button
            type="submit"
            disabled={!inputMessage.trim() || isLoading}
            className="absolute right-3 px-6 py-2 bg-[#5A5A40] hover:bg-[#4A4A35] text-white rounded-xl text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            style={{ bottom: '8px' }}
          >
            发送
          </button>
        </form>
        <div className="text-center mt-3 text-[11px] text-[#A6A298] font-medium">
          AI 提供的内容仅供参考，不代表专业医疗诊断意见。如遇心理危机，请寻求专业援助。
        </div>
      </div>
    </div>
  );
};
