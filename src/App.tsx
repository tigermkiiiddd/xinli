import React, { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Chat, type Message, type AppSettings } from './db';
import { AgentService, type AgentStep } from './services/agentService';

// Sub-components
import { Sidebar } from './components/Layout/Sidebar';
import { Header } from './components/Layout/Header';
import { ChatArea } from './components/Chat/ChatArea';
import { ChatInput } from './components/Chat/ChatInput';
import { ProfileModal } from './components/Modals/ProfileModal';
import { SettingsModal } from './components/Modals/SettingsModal';
import { MentorModal } from './components/Modals/MentorModal';
import { MemoryModal } from './components/Modals/MemoryModal';

export default function App() {
  const chats = useLiveQuery(() => db.chats.orderBy('updatedAt').reverse().toArray()) || [];
  const memories = useLiveQuery(() => db.memories.orderBy('updatedAt').reverse().toArray()) || [];
  const userProfileData = useLiveQuery(() => db.userProfile.get(1));

  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMentorModalOpen, setIsMentorModalOpen] = useState(false);
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [activeSettingsTab, setActiveSettingsTab] = useState<'api' | 'ui'>('api');
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);
  const [memorySearchTerm, setMemorySearchTerm] = useState('');

  const settingsData = useLiveQuery(() => db.settings.get(1));
  const [settingsForm, setSettingsForm] = useState<AppSettings>({
    id: 1,
    provider: 'openai',
    openaiApiKey: '',
    openaiBaseUrl: '',
    openaiModel: '',
    geminiApiKey: '',
    maxContextWindow: 256000,
    chatBackgroundMode: 'default',
    chatBackgroundColor: '#f9f8f6',
    chatBackgroundImage: '',
    assistantAvatar: '',
    assistantName: '心语',
    userAvatar: ''
  });

  const [profileForm, setProfileForm] = useState({
    nickname: '',
    age: '',
    occupation: '',
    emotional_state: '',
    counseling_goals: '',
    background_info: ''
  });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-archiving logic
  useEffect(() => {
    const checkArchivable = async () => {
      if (!settingsData) return;
      const allChats = await db.chats.toArray();
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      const archivable = allChats.filter(c => c.updatedAt < twoHoursAgo && !c.isArchived && c.messages.length > 0);
      
      if (archivable.length > 0) {
        console.log(`Checking ${archivable.length} chats for archiving...`);
        const agent = new AgentService(settingsData, userProfileData);
        for (const chat of archivable) {
          await agent.archiveChat(chat);
        }
      }
    };
    
    const timeout = setTimeout(checkArchivable, 5000); // Check 5s after load
    return () => clearTimeout(timeout);
  }, [settingsData, userProfileData]);

  // Sync activeChatId and ensure at least one chat
  useEffect(() => {
    if (chats.length > 0 && !activeChatId && !chats.find(c => c.id === activeChatId)) {
      setActiveChatId(chats[0].id);
    } else if (chats.length === 0 && chats !== undefined) {
      // Create initial chat if none exists
      const initChat = async () => {
        const count = await db.chats.count();
        if (count === 0) {
          const newChat: Chat = {
            id: uuidv4(),
            title: '新对话',
            messages: [],
            updatedAt: Date.now(),
          };
          await db.chats.add(newChat);
          setActiveChatId(newChat.id);
        }
      };
      initChat();
    }
  }, [chats, activeChatId]);

  // Load Profile to state
  useEffect(() => {
    if (userProfileData) {
      setProfileForm({
        nickname: userProfileData.nickname || '',
        age: userProfileData.age?.toString() || '',
        occupation: userProfileData.occupation || '',
        emotional_state: userProfileData.emotional_state || '',
        counseling_goals: userProfileData.counseling_goals || '',
        background_info: userProfileData.background_info || ''
      });
    }
  }, [userProfileData]);

  useEffect(() => {
    if (settingsData) {
      setSettingsForm(settingsData);
    }
  }, [settingsData]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chats, activeChatId, agentSteps]);

  const activeChat = chats.find(c => c.id === activeChatId) || null;

  const createNewChat = async () => {
    const newChat: Chat = {
      id: uuidv4(),
      title: '新对话',
      messages: [],
      updatedAt: Date.now(),
    };
    await db.chats.add(newChat);
    setActiveChatId(newChat.id);
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };

  const deleteChat = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await db.chats.delete(id);
    if (activeChatId === id) {
      const remaining = await db.chats.orderBy('updatedAt').reverse().toArray();
      setActiveChatId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const sendMessageToApi = async (messagesToSend: Message[], currentChat: Chat, titleToUpdate: string) => {
    setIsLoading(true);
    setAgentSteps([]);

    try {
      const settings = settingsData || { provider: 'openai' } as AppSettings;
      const maxContext = settings.maxContextWindow || 256000;
      
      // Calculate current context tokens
      // We look at the last assistant message's usage to get the total tokens of the previous turn
      const lastAssistantMsg = [...messagesToSend].reverse().find(m => m.role === 'assistant' && m.usage);
      const currentTokenCount = lastAssistantMsg?.usage?.totalTokens || 0;
      
      let finalMessagesToSend = [...messagesToSend];

      if (currentTokenCount > maxContext * 0.8 && messagesToSend.length > 5) {
        // Trigger compression
        const agent = new AgentService(settings, userProfileData);
        setAgentSteps([{ thought: '上下文即将达到上限 (80%)，正在启动深度分析与心理状态压缩...', action: 'Summarize' }]);
        
        const summary = await agent.summarizePsychologically(messagesToSend);
        
        const summaryMessage: Message = {
          id: uuidv4(),
          role: 'system',
          content: `🔄 **已完成上下文压缩**\n\n心理分析摘要：\n${summary}`,
          createdAt: Date.now(),
          isSummary: true
        };

        // Keeps the last user message and the summary
        const lastUserMessage = messagesToSend[messagesToSend.length - 1];
        finalMessagesToSend = [summaryMessage, lastUserMessage];
        
        // Update DB with the compression feedback
        const freshChat = await db.chats.get(currentChat.id);
        if (freshChat) {
          await db.chats.put({
            ...freshChat,
            title: titleToUpdate,
            messages: [...freshChat.messages, summaryMessage],
            updatedAt: Date.now()
          });
        }
      } else {
        await db.chats.put({
          ...currentChat,
          title: titleToUpdate,
          messages: messagesToSend,
          updatedAt: Date.now()
        });
      }

      const agent = new AgentService(settings, userProfileData);
      const { content: replyContent, usage } = await agent.runChat(finalMessagesToSend, (step) => {
        setAgentSteps(prev => [...prev, step]);
      });

      const assistantMessage: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: replyContent,
        createdAt: Date.now(),
        usage: usage
      };

      const freshChat = await db.chats.get(currentChat.id);
      if (freshChat) {
         await db.chats.put({
          ...freshChat,
          messages: [...freshChat.messages, assistantMessage],
          updatedAt: Date.now()
        });
      }
    } catch (error: any) {
      console.error(error);
      const errorMessage: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: `**系统错误**: 无法获取回复。 (${error.message}) \n请检查网络连接或 API key 配置。`,
        createdAt: Date.now(),
      };
      
      const freshChat = await db.chats.get(currentChat.id);
      if (freshChat) {
         await db.chats.put({
          ...freshChat,
          messages: [...freshChat.messages, errorMessage],
          updatedAt: Date.now()
        });
      }
    } finally {
      setIsLoading(false);
      setAgentSteps([]);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputMessage.trim() || !activeChat || isLoading) return;

    const messageContent = inputMessage.trim();
    setInputMessage('');

    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content: messageContent,
      createdAt: Date.now(),
    };

    let titleToUpdate = activeChat.title;
    if (activeChat.messages.length === 0) {
      titleToUpdate = messageContent.length > 15 ? messageContent.substring(0, 15) + '...' : messageContent;
    }

    const currentMessages = [...activeChat.messages, userMessage];
    await sendMessageToApi(currentMessages, activeChat, titleToUpdate);
  };

  const handleEditMessage = (messageId: string, content: string) => {
    setEditingMessageId(messageId);
    setEditText(content);
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setEditText('');
  };

  const saveEditAndResend = async (messageId: string) => {
    if (!activeChat || !editText.trim() || isLoading) return;
    const targetIndex = activeChat.messages.findIndex(m => m.id === messageId);
    if (targetIndex === -1) return;

    const updatedMessage = { ...activeChat.messages[targetIndex], content: editText.trim() };
    const truncatedMessages = [...activeChat.messages.slice(0, targetIndex), updatedMessage];
    
    setEditingMessageId(null);
    await sendMessageToApi(truncatedMessages, activeChat, activeChat.title);
  };

  const handleRegenerate = async (messageId: string) => {
    if (!activeChat || isLoading) return;
    const targetIndex = activeChat.messages.findIndex(m => m.id === messageId);
    if (targetIndex === -1) return;

    const truncatedMessages = activeChat.messages.slice(0, targetIndex);
    await sendMessageToApi(truncatedMessages, activeChat, activeChat.title);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleArchiveChat = async (chat: Chat) => {
    if (settingsData) {
      const agent = new AgentService(settingsData, userProfileData);
      setIsLoading(true);
      await agent.archiveChat(chat);
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-[#F9F8F6] text-[#2D2926] font-sans">
      <Sidebar
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        chats={chats}
        activeChatId={activeChatId}
        setActiveChatId={setActiveChatId}
        createNewChat={createNewChat}
        deleteChat={deleteChat}
        userProfileData={userProfileData}
        settingsData={settingsData}
        setIsMemoryOpen={setIsMemoryOpen}
        setIsSettingsOpen={setIsSettingsOpen}
        setIsProfileOpen={setIsProfileOpen}
        setIsLoading={setIsLoading}
      />

      <main className="flex-1 flex flex-col min-w-0 bg-white relative bg-cover bg-center transition-all duration-300"
        style={{
          backgroundColor: settingsForm.chatBackgroundMode === 'color' ? settingsForm.chatBackgroundColor : (settingsForm.chatBackgroundMode === 'default' ? '#ffffff' : 'transparent'),
          backgroundImage: settingsForm.chatBackgroundMode === 'image' && settingsForm.chatBackgroundImage ? `url(${settingsForm.chatBackgroundImage})` : 'none'
        }}
      >
        <Header
          onMenuClick={() => setIsSidebarOpen(true)}
          onMentorClick={() => setIsMentorModalOpen(true)}
          settingsForm={settingsForm}
          activeChat={activeChat}
          onArchiveClick={() => activeChat && handleArchiveChat(activeChat)}
        />

        <ChatArea
          activeChat={activeChat}
          settingsForm={settingsForm}
          isLoading={isLoading}
          agentSteps={agentSteps}
          messagesEndRef={messagesEndRef}
          editingMessageId={editingMessageId}
          editText={editText}
          setEditText={setEditText}
          onEditMessage={handleEditMessage}
          onCancelEdit={cancelEdit}
          onSaveEdit={saveEditAndResend}
          onRegenerate={handleRegenerate}
          onInputSuggestion={setInputMessage}
          onMentorModalOpen={() => setIsMentorModalOpen(true)}
        />

        <ChatInput
          inputMessage={inputMessage}
          setInputMessage={setInputMessage}
          isLoading={isLoading}
          onSendMessage={handleSendMessage}
          onKeyDown={handleKeyDown}
        />
      </main>

      <MentorModal
        isOpen={isMentorModalOpen}
        onClose={() => setIsMentorModalOpen(false)}
        settingsForm={settingsForm}
        setSettingsForm={setSettingsForm}
      />

      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        profileForm={profileForm}
        setProfileForm={setProfileForm}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settingsForm={settingsForm}
        setSettingsForm={setSettingsForm}
        activeSettingsTab={activeSettingsTab}
        setActiveSettingsTab={setActiveSettingsTab}
      />

      <MemoryModal
        isOpen={isMemoryOpen}
        onClose={() => setIsMemoryOpen(false)}
        memories={memories}
        memorySearchTerm={memorySearchTerm}
        setMemorySearchTerm={setMemorySearchTerm}
      />
    </div>
  );
}

