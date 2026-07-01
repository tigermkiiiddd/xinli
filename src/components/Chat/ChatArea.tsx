import React from 'react';
import { Sparkles, Database } from 'lucide-react';
import { MessageItem } from './MessageItem';
import { type Chat, type Message, type AppSettings } from '../../db';
import { type AgentStep } from '../../services/agentService';

interface ChatAreaProps {
  activeChat: Chat | null;
  settingsForm: AppSettings;
  isLoading: boolean;
  agentSteps: AgentStep[];
  messagesEndRef: React.RefObject<HTMLDivElement>;
  editingMessageId: string | null;
  editText: string;
  setEditText: (text: string) => void;
  onEditMessage: (id: string, content: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string) => void;
  onRegenerate: (id: string) => void;
  onInputSuggestion: (suggestion: string) => void;
  onMentorModalOpen: () => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  activeChat,
  settingsForm,
  isLoading,
  agentSteps,
  messagesEndRef,
  editingMessageId,
  editText,
  setEditText,
  onEditMessage,
  onCancelEdit,
  onSaveEdit,
  onRegenerate,
  onInputSuggestion,
  onMentorModalOpen
}) => {
  return (
    <div className="flex-1 overflow-y-auto px-3 py-4 md:p-6 custom-scrollbar pb-8">
      <div className="max-w-3xl mx-auto space-y-4 md:space-y-6">
        {activeChat?.messages.length === 0 ? (
          <div className="h-full min-h-[50vh] flex flex-col items-center justify-center text-center px-4 fade-in">
            <div className="w-16 h-16 bg-[#F5F5F0] rounded-full flex items-center justify-center mb-6 shadow-sm border border-[#E5E1D8]">
              <Sparkles className="w-8 h-8 text-[#5A5A40]" />
            </div>
            <h2 className="text-xl font-serif italic text-[#2D2926] mb-3">你好，我是你的专属心理助手</h2>
            <p className="text-[#8E8B82] max-w-md text-sm leading-relaxed">
              这里是一个安全、倾听和不加评判的空间。无论你遇到什么困扰、焦虑，或是单纯想找人说说话，我都在这里陪你。
            </p>
            <div className="mt-8 flex flex-wrap gap-2 justify-center max-w-lg">
              {['我最近感觉压力好大', '总是失眠怎么办？', '如何缓解社交焦虑', '可以陪我聊聊吗？'].map(suggestion => (
                <button
                  key={suggestion}
                  onClick={() => onInputSuggestion(suggestion)}
                  className="px-4 py-2 bg-white border border-[#E5E1D8] rounded-full text-sm text-[#4A463F] hover:border-[#5A5A40] hover:text-[#5A5A40] hover:bg-[#F9F8F6] transition-all shadow-sm"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          activeChat?.messages.map((message) => (
            <MessageItem
              key={message.id}
              message={message}
              settingsForm={settingsForm}
              editingMessageId={editingMessageId}
              editText={editText}
              setEditText={setEditText}
              isLoading={isLoading}
              onEdit={onEditMessage}
              onCancelEdit={onCancelEdit}
              onSaveEdit={onSaveEdit}
              onRegenerate={onRegenerate}
              onAvatarClick={onMentorModalOpen}
            />
          ))
        )}

        {isLoading && (
          <div className="flex flex-col gap-4 fade-in w-full md:max-w-[80%]">
            <div className="flex flex-col md:flex-row md:gap-4">
              <button onClick={onMentorModalOpen} className="flex-shrink-0 flex justify-start mb-1.5 md:mb-0 md:mt-1">
                {settingsForm.assistantAvatar ? (
                  <img src={settingsForm.assistantAvatar} alt="Assistant" className="w-8 h-8 md:w-9 md:h-9 rounded-xl object-cover shadow-sm" />
                ) : (
                  <div className="w-8 h-8 md:w-9 md:h-9 rounded-xl bg-[#5A5A40] flex items-center justify-center text-white font-serif italic shadow-sm px-2 text-sm">
                    {settingsForm.assistantName?.charAt(0) || '心'}
                  </div>
                )}
              </button>
              <div className="w-full max-md:w-[calc(100%-1.25rem)] md:w-auto bg-[#F5F5F0] border border-[#E5E1D8] rounded-2xl rounded-tl-none p-3.5 md:p-4 shadow-sm flex items-center gap-1.5 h-12">
                <div className="w-1.5 h-1.5 bg-[#8E8B82] rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-1.5 h-1.5 bg-[#8E8B82] rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-1.5 h-1.5 bg-[#8E8B82] rounded-full animate-bounce"></div>
              </div>
            </div>

            {agentSteps.length > 0 && (
              <div className="md:ml-12 p-3 bg-white/50 border border-dashed border-[#E5E1D8] rounded-xl text-[11px] space-y-2">
                <div className="flex items-center gap-2 text-[#A6A298] font-bold uppercase tracking-tight">
                  <Database className="w-3 h-3" /> Agent 思考步骤
                </div>
                {agentSteps.map((step, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="text-[#5A5A40]">Thought: {step.thought}</div>
                    {step.action && <div className="text-blue-600">Action: {step.action} ({typeof step.actionInput === 'object' ? JSON.stringify(step.actionInput) : step.actionInput})</div>}
                    {step.observation && <div className="text-green-600">Observation: {typeof step.observation === 'object' ? JSON.stringify(step.observation) : step.observation}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};
