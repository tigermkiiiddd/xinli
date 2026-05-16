import React, { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { 
  MessageSquare, Plus, Trash2, Bot, User, 
  Menu, X, Sparkles, Settings, UserCircle,
  Edit2, RefreshCcw, Check
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Chat, type Message, type UserProfile, type AppSettings } from './db';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';

export default function App() {
  const chats = useLiveQuery(() => db.chats.orderBy('updatedAt').reverse().toArray()) || [];
  const userProfileData = useLiveQuery(() => db.userProfile.get(1));

  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [activeSettingsTab, setActiveSettingsTab] = useState<'api' | 'ui'>('api');
  const settingsData = useLiveQuery(() => db.settings.get(1));
  const [settingsForm, setSettingsForm] = useState<AppSettings>({
    id: 1,
    provider: 'openai',
    openaiApiKey: '',
    openaiBaseUrl: '',
    openaiModel: '',
    geminiApiKey: '',
    chatBackgroundMode: 'default',
    chatBackgroundColor: '#f9f8f6',
    chatBackgroundImage: '',
    assistantAvatar: '',
    userAvatar: ''
  });

  const [profileForm, setProfileForm] = useState({
    age: '',
    occupation: '',
    emotional_state: '',
    counseling_goals: '',
    background_info: ''
  });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await db.settings.put({
        ...settingsForm,
        id: 1
      });
      setIsSettingsOpen(false);
    } catch(err) {
      console.error(err);
    }
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await db.userProfile.put({
        id: 1, // statically use 1 for the local user profile
        ...profileForm,
        age: profileForm.age ? parseInt(profileForm.age) : ''
      });
      setIsProfileOpen(false);
    } catch(err) {
      console.error(err);
    }
  };

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chats, activeChatId]);

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

    try {
      await db.chats.put({
        ...currentChat,
        title: titleToUpdate,
        messages: messagesToSend,
        updatedAt: Date.now()
      });

      const settings = settingsData || { provider: 'openai' } as AppSettings;
      const provider = settings.provider || 'openai';
      
      // 1. Get user profile context
      let profileContext = "";
      if (userProfileData && Object.values(userProfileData).filter(Boolean).length > 0) {
        profileContext = `\n\n【用户个性化档案】
- 年龄：${userProfileData.age || '未知'}
- 职业：${userProfileData.occupation || '未知'}
- 长期情感状态/自评：${userProfileData.emotional_state || '未知'}
- 辅导目标：${userProfileData.counseling_goals || '未知'}
- 背景信息：${userProfileData.background_info || '无'}
请在回应中自然地参考这些信息以提供更个性化的辅导。`;
      }

      // 2. Recognize emotion from the latest user message
      const latestUserMessage = messagesToSend.filter((m: any) => m.role === 'user').pop()?.content || '';
      let emotionLabel = '中性 (Neutral)';

      const baseSystemContent = `你是一位专业、有同理心、经验丰富的心理咨询师。你的目标是提供心理支持、倾听用户的困扰、帮助他们进行情绪调节，并提供温和的建设性建议。
在与用户交流时，请遵循以下原则：
1. 始终保持专注、接纳和无条件积极关注。
2. 避免说教或替用户做直接决定，引导他们自我探索。
3. 语言需温和、体贴、真诚，使用鼓励性的语言。
4. 如果评估到用户可能存在严重的精神危机或有自残/自杀倾向，请务必建议他们寻求专业的现场医疗帮助或拨打危机援助热线。`;

      let replyContent = '';
      let effectiveProvider = provider;

      // Handle Fallback / Provider selection
      if (effectiveProvider === 'openai' && !settings.openaiApiKey && settings.geminiApiKey) {
        effectiveProvider = 'gemini';
      }

      if (effectiveProvider === 'gemini') {
        const apiKey = settings.geminiApiKey;
        if (!apiKey) {
          throw new Error('未配置 Gemini API Key，请在设置中配置。');
        }
        const ai = new GoogleGenAI({ 
          apiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } 
        });

        // Emotion recognition logic
        if (latestUserMessage) {
          try {
            const result = await ai.models.generateContent({
              model: "gemini-2.5-flash",
              contents: [{ text: "You are an emotion analyzer. Analyze the user's text and return ONLY one of these labels: '积极 (Positive)', '消极 (Negative) - 悲伤', '消极 (Negative) - 愤怒', '消极 (Negative) - 焦虑', or '中性 (Neutral)'.\n\nUser text: " + latestUserMessage }]
            });
            emotionLabel = result.text?.trim() || emotionLabel;
          } catch (e) {
            console.error('Gemini emotion recognition failed:', e);
          }
        }

        const emotionContext = `\n\n【实时情绪识别】\n目前检测到用户这段话的情感状态为：${emotionLabel}。\n如果用户情绪低落（如悲伤、焦虑、压力大），请表现出更多的同情、耐心 and 理解；如果心情积极，可以更受鼓励并探讨进展，根据情绪动态调整回应语气。`;
        
        const genAiMessages = messagesToSend.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }));

        const result = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: genAiMessages,
          config: {
            systemInstruction: baseSystemContent + profileContext + emotionContext,
            temperature: 0.7,
            maxOutputTokens: 1500
          }
        });
        replyContent = result.text || '';

      } else {
        const apiKey = settings.openaiApiKey;
        if (!apiKey) {
          throw new Error('未配置 OpenAI API Key，请在设置中配置。');
        }
        const openai = new OpenAI({
          apiKey: apiKey,
          baseURL: settings.openaiBaseUrl || 'https://api.openai.com/v1',
          dangerouslyAllowBrowser: true
        });

        // Emotion recognition logic
        if (latestUserMessage) {
          try {
            const resp = await openai.chat.completions.create({
              model: settings.openaiModel || 'gpt-3.5-turbo',
              messages: [
                { role: "system", content: "You are an emotion analyzer. Analyze the user's text and return ONLY one of these labels: '积极 (Positive)', '消极 (Negative) - 悲伤', '消极 (Negative) - 愤怒', '消极 (Negative) - 焦虑', or '中性 (Neutral)'." },
                { role: "user", content: latestUserMessage }
              ],
              temperature: 0,
              max_tokens: 15,
            });
            emotionLabel = resp.choices[0]?.message?.content?.trim() || emotionLabel;
          } catch (e) {
            console.error('OpenAI emotion recognition failed:', e);
          }
        }

        const emotionContext = `\n\n【实时情绪识别】\n目前检测到用户这段话的情感状态为：${emotionLabel}。\n如果用户情绪低落（如悲伤、焦虑、压力大），请表现出更多的同情、耐心和理解；如果心情积极，可以更受鼓励并探讨进展，根据情绪动态调整回应语气。`;
        
        const apiMessages = [
          { role: 'system', content: baseSystemContent + profileContext + emotionContext },
          ...messagesToSend.map(m => ({ role: m.role, content: m.content }))
        ];

        const response = await openai.chat.completions.create({
          model: settings.openaiModel || 'gpt-3.5-turbo',
          messages: apiMessages as any,
          temperature: 0.7,
          max_tokens: 1500,
        });
        replyContent = response.choices[0]?.message?.content || '';
      }

      const assistantMessage: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: replyContent,
        createdAt: Date.now(),
        emotion: emotionLabel,
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

  return (
    <div className="flex h-screen overflow-hidden bg-[#F9F8F6] text-[#2D2926] font-sans">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-20 md:hidden transition-opacity" 
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`fixed md:static inset-y-0 left-0 z-30 w-72 bg-[#F2EFE9] border-r border-[#E5E1D8] transform transition-transform duration-300 ease-in-out flex flex-col ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
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
            onClick={() => setIsSidebarOpen(false)}
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
                if (window.innerWidth < 768) setIsSidebarOpen(false);
              }}
              className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                activeChatId === chat.id 
                  ? 'bg-white border border-[#E5E1D8] shadow-sm' 
                  : 'hover:bg-[#EAE6DD]'
              }`}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <MessageSquare className={`min-w-4 h-4 ${
                  activeChatId === chat.id ? 'text-[#5A5A40]' : 'text-[#8E8B82]'
                }`} />
                <span className={`truncate text-sm font-medium ${activeChatId === chat.id ? 'text-[#2D2926]' : 'text-[#2D2926]'}`}>
                  {chat.title}
                </span>
              </div>
              <button 
                onClick={(e) => deleteChat(e, chat.id)}
                className={`text-[#A6A298] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50 ${
                  chats.length === 1 ? 'hidden' : ''
                }`}
                title="删除对话"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </nav>
        
        <div className="p-4 border-t border-[#E5E1D8] bg-[#EAE6DD] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#D9D4C7] border border-[#C5C0B3] flex items-center justify-center font-serif text-lg text-[#5A5A40]">理</div>
            <div className="flex-1">
              <div className="text-sm font-semibold">AI 心理导师</div>
              <div className="text-[10px] text-[#8E8B82] flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> 在线咨询中
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
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

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-white relative bg-cover bg-center transition-all duration-300" 
        style={{
          backgroundColor: settingsForm.chatBackgroundMode === 'color' ? settingsForm.chatBackgroundColor : (settingsForm.chatBackgroundMode === 'default' ? '#ffffff' : 'transparent'),
          backgroundImage: settingsForm.chatBackgroundMode === 'image' && settingsForm.chatBackgroundImage ? `url(${settingsForm.chatBackgroundImage})` : 'none'
        }}
      >
        {/* Header */}
        <header className="h-16 border-b border-[#F0EDE8] flex items-center px-8 bg-white/80 backdrop-blur-sm shrink-0 z-10 sticky top-0">
          <button 
            className="md:hidden mr-3 p-2 text-[#8E8B82] hover:text-[#5A5A40] transition-colors"
            onClick={() => setIsSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg font-serif italic text-[#2D2926]">{activeChat?.title || 'AI 心理咨询师'}</h2>
            <p className="text-[10px] text-[#A6A298] uppercase tracking-widest mt-0.5">正在与 AI 导师进行对话</p>
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar pb-36">
          <div className="max-w-3xl mx-auto space-y-6">
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
                      onClick={() => setInputMessage(suggestion)}
                      className="px-4 py-2 bg-white border border-[#E5E1D8] rounded-full text-sm text-[#4A463F] hover:border-[#5A5A40] hover:text-[#5A5A40] hover:bg-[#F9F8F6] transition-all shadow-sm"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              activeChat?.messages.map((message) => (
                <div 
                  key={message.id} 
                  className={`flex gap-4 fade-in group ${message.role === 'user' ? 'flex-row-reverse ml-auto max-w-[80%]' : 'max-w-[80%]'}`}
                >
                  {message.role === 'assistant' && (
                    settingsForm.assistantAvatar ? (
                      <img src={settingsForm.assistantAvatar} alt="Assistant" className="w-9 h-9 rounded-xl flex-shrink-0 object-cover mt-1 shadow-sm" />
                    ) : (
                      <div className="w-9 h-9 rounded-xl bg-[#5A5A40] flex-shrink-0 flex items-center justify-center text-white font-serif italic shadow-sm mt-1">
                        心
                      </div>
                    )
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
                  
                  {editingMessageId === message.id && message.role === 'user' ? (
                    <div className="flex-1 w-full flex flex-col gap-2 relative mt-1">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="w-full bg-white border border-[#5A5A40] rounded-xl p-3 text-sm text-[#2D2926] focus:outline-none focus:ring-2 focus:ring-[#5A5A40]/20 resize-none min-h-[80px]"
                      />
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={cancelEdit} 
                          className="px-3 py-1.5 text-xs text-[#5A5A40] bg-[#F5F5F0] hover:bg-[#EAE6DD] rounded-md transition-colors"
                        >
                          取消
                        </button>
                        <button 
                          onClick={() => saveEditAndResend(message.id)} 
                          className="px-3 py-1.5 text-xs text-white bg-[#5A5A40] hover:bg-[#4A4A35] rounded-md transition-colors flex items-center gap-1"
                        >
                          <Check className="w-3 h-3" /> 保存并重新发送
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-start min-w-0" style={{ alignItems: message.role === 'user' ? 'flex-end' : 'flex-start' }}>
                      <div className={`rounded-2xl p-4 shadow-sm border ${
                        message.role === 'user' 
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
                             onClick={() => handleEditMessage(message.id, message.content)}
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
                             onClick={() => handleRegenerate(message.id)}
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
              ))
            )}
            
            {isLoading && (
              <div className="flex gap-4 fade-in max-w-[80%]">
                <div className="w-9 h-9 rounded-xl bg-[#5A5A40] flex-shrink-0 flex items-center justify-center text-white font-serif italic mt-1 shadow-sm">
                  心
                </div>
                <div className="bg-[#F5F5F0] border border-[#E5E1D8] rounded-2xl p-4 rounded-tl-none shadow-sm flex items-center gap-1.5 h-12">
                  <div className="w-1.5 h-1.5 bg-[#8E8B82] rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                  <div className="w-1.5 h-1.5 bg-[#8E8B82] rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-1.5 h-1.5 bg-[#8E8B82] rounded-full animate-bounce"></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white to-transparent pt-10 pb-6 px-4 md:px-6 z-10 pointer-events-none">
          <div className="max-w-3xl mx-auto pointer-events-auto">
            <form 
              onSubmit={handleSendMessage}
              className="relative flex items-center bg-[#F9F8F6] rounded-2xl border border-[#E5E1D8] focus-within:border-[#5A5A40] transition-colors shadow-sm"
            >
              <textarea
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyDown}
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
      </main>

      {/* Profile Modal */}
      {isProfileOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm fade-in">
          <div className="bg-[#F9F8F6] rounded-2xl w-full max-w-md overflow-hidden shadow-xl border border-[#E5E1D8] flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-[#E5E1D8] flex justify-between items-center bg-white">
              <h3 className="font-serif italic font-semibold text-[#5A5A40] text-lg">个人档案设置</h3>
              <button onClick={() => setIsProfileOpen(false)} className="text-[#8E8B82] hover:text-[#2D2926] p-1 rounded-md hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5"/>
              </button>
            </div>
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
              <form id="profile-form" onSubmit={saveProfile} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-[#A6A298] uppercase tracking-tighter mb-1.5">年龄</label>
                  <input type="number" value={profileForm.age} onChange={e => setProfileForm({...profileForm, age: e.target.value})} className="w-full p-2.5 bg-white border border-[#E5E1D8] rounded-lg text-sm focus:outline-none focus:border-[#5A5A40]" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#A6A298] uppercase tracking-tighter mb-1.5">职业</label>
                  <input type="text" value={profileForm.occupation} onChange={e => setProfileForm({...profileForm, occupation: e.target.value})} className="w-full p-2.5 bg-white border border-[#E5E1D8] rounded-lg text-sm focus:outline-none focus:border-[#5A5A40]" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#A6A298] uppercase tracking-tighter mb-1.5">长期情感状态/自评</label>
                  <input type="text" placeholder="如：容易焦虑、疲惫" value={profileForm.emotional_state} onChange={e => setProfileForm({...profileForm, emotional_state: e.target.value})} className="w-full p-2.5 bg-white border border-[#E5E1D8] rounded-lg text-sm focus:outline-none focus:border-[#5A5A40]" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#A6A298] uppercase tracking-tighter mb-1.5">辅导目标</label>
                  <input type="text" placeholder="如：学会缓解压力" value={profileForm.counseling_goals} onChange={e => setProfileForm({...profileForm, counseling_goals: e.target.value})} className="w-full p-2.5 bg-white border border-[#E5E1D8] rounded-lg text-sm focus:outline-none focus:border-[#5A5A40]" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#A6A298] uppercase tracking-tighter mb-1.5">背景信息 (让AI更了解你)</label>
                  <textarea rows={3} placeholder="任何你希望AI参考的背景信息..." value={profileForm.background_info} onChange={e => setProfileForm({...profileForm, background_info: e.target.value})} className="w-full p-2.5 bg-white border border-[#E5E1D8] rounded-lg text-sm focus:outline-none focus:border-[#5A5A40] resize-none" />
                </div>
              </form>
            </div>
            <div className="p-5 bg-white border-t border-[#E5E1D8] flex justify-end gap-3">
              <button type="button" onClick={() => setIsProfileOpen(false)} className="px-5 py-2 text-[#5A5A40] hover:bg-[#F5F5F0] rounded-xl text-sm font-medium transition-colors">
                取消
              </button>
              <button type="submit" form="profile-form" className="px-5 py-2 bg-[#5A5A40] text-white rounded-xl text-sm font-medium hover:bg-[#4A4A35] transition-colors">
                保存档案
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm fade-in">
          <div className="bg-[#F9F8F6] rounded-2xl w-full max-w-md overflow-hidden shadow-xl border border-[#E5E1D8] flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-[#E5E1D8] flex flex-col bg-white">
              <div className="flex justify-between items-center mb-4">
                 <h3 className="font-serif italic font-semibold text-[#5A5A40] text-lg">系统设置</h3>
                 <button onClick={() => setIsSettingsOpen(false)} className="text-[#8E8B82] hover:text-[#2D2926] p-1 rounded-md hover:bg-slate-100 transition-colors">
                   <X className="w-5 h-5"/>
                 </button>
              </div>
              <div className="flex gap-2 text-sm font-medium">
                 <button 
                   onClick={() => setActiveSettingsTab('api')}
                   className={`px-3 py-1.5 rounded-lg transition-colors ${activeSettingsTab === 'api' ? 'bg-[#5A5A40] text-white' : 'text-[#8E8B82] hover:bg-[#F5F5F0]'}`}
                 >
                   API 配置
                 </button>
                 <button 
                   onClick={() => setActiveSettingsTab('ui')}
                   className={`px-3 py-1.5 rounded-lg transition-colors ${activeSettingsTab === 'ui' ? 'bg-[#5A5A40] text-white' : 'text-[#8E8B82] hover:bg-[#F5F5F0]'}`}
                 >
                   界面外观
                 </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
              <form id="settings-form" onSubmit={saveSettings} className="space-y-4">
                {activeSettingsTab === 'api' ? (
                  <>
                    <div>
                      <label className="block text-[11px] font-bold text-[#A6A298] uppercase tracking-tighter mb-1.5">模型供应商</label>
                      <select 
                        value={settingsForm.provider}
                        onChange={(e) => setSettingsForm({...settingsForm, provider: e.target.value as any})}
                        className="w-full p-2.5 bg-white border border-[#E5E1D8] rounded-lg text-sm focus:outline-none focus:border-[#5A5A40] appearance-none"
                      >
                        <option value="openai">OpenAI (默认)</option>
                        <option value="gemini">Google Gemini SDK</option>
                      </select>
                    </div>
                    {settingsForm.provider === 'openai' && (
                      <>
                        <div>
                          <label className="block text-[11px] font-bold text-[#A6A298] uppercase tracking-tighter mb-1.5">OpenAI API Key</label>
                          <input type="password" value={settingsForm.openaiApiKey || ''} onChange={e => setSettingsForm({...settingsForm, openaiApiKey: e.target.value})} className="w-full p-2.5 bg-white border border-[#E5E1D8] rounded-lg text-sm focus:outline-none focus:border-[#5A5A40]" />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-[#A6A298] uppercase tracking-tighter mb-1.5">自定义 Base URL</label>
                          <input type="text" placeholder="https://api.openai.com/v1" value={settingsForm.openaiBaseUrl || ''} onChange={e => setSettingsForm({...settingsForm, openaiBaseUrl: e.target.value})} className="w-full p-2.5 bg-white border border-[#E5E1D8] rounded-lg text-sm focus:outline-none focus:border-[#5A5A40]" />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-[#A6A298] uppercase tracking-tighter mb-1.5">模型</label>
                          <input type="text" placeholder="gpt-3.5-turbo" value={settingsForm.openaiModel || ''} onChange={e => setSettingsForm({...settingsForm, openaiModel: e.target.value})} className="w-full p-2.5 bg-white border border-[#E5E1D8] rounded-lg text-sm focus:outline-none focus:border-[#5A5A40]" />
                        </div>
                      </>
                    )}
                    {settingsForm.provider === 'gemini' && (
                      <div>
                        <label className="block text-[11px] font-bold text-[#A6A298] uppercase tracking-tighter mb-1.5">Gemini API Key</label>
                        <input type="password" value={settingsForm.geminiApiKey || ''} onChange={e => setSettingsForm({...settingsForm, geminiApiKey: e.target.value})} className="w-full p-2.5 bg-white border border-[#E5E1D8] rounded-lg text-sm focus:outline-none focus:border-[#5A5A40]" />
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-[11px] font-bold text-[#A6A298] uppercase tracking-tighter mb-1.5">用户头像URL / Base64</label>
                      <input type="text" placeholder="粘贴图片URL..." value={settingsForm.userAvatar || ''} onChange={e => setSettingsForm({...settingsForm, userAvatar: e.target.value})} className="w-full p-2.5 bg-white border border-[#E5E1D8] rounded-lg text-sm focus:outline-none focus:border-[#5A5A40]" />
                      <input type="file" accept="image/*" className="mt-2 text-xs" onChange={(e) => {
                         const file = e.target.files?.[0];
                         if (file) {
                           const reader = new FileReader();
                           reader.onload = (ev) => setSettingsForm({...settingsForm, userAvatar: ev.target?.result as string});
                           reader.readAsDataURL(file);
                         }
                      }} />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[#A6A298] uppercase tracking-tighter mb-1.5">AI 助手头像URL / Base64</label>
                      <input type="text" placeholder="粘贴图片URL..." value={settingsForm.assistantAvatar || ''} onChange={e => setSettingsForm({...settingsForm, assistantAvatar: e.target.value})} className="w-full p-2.5 bg-white border border-[#E5E1D8] rounded-lg text-sm focus:outline-none focus:border-[#5A5A40]" />
                      <input type="file" accept="image/*" className="mt-2 text-xs" onChange={(e) => {
                         const file = e.target.files?.[0];
                         if (file) {
                           const reader = new FileReader();
                           reader.onload = (ev) => setSettingsForm({...settingsForm, assistantAvatar: ev.target?.result as string});
                           reader.readAsDataURL(file);
                         }
                      }} />
                    </div>
                    <div className="pt-2">
                       <label className="block text-[11px] font-bold text-[#A6A298] uppercase tracking-tighter mb-1.5">聊天背景模式</label>
                       <select 
                         value={settingsForm.chatBackgroundMode}
                         onChange={(e) => setSettingsForm({...settingsForm, chatBackgroundMode: e.target.value as any})}
                         className="w-full p-2.5 bg-white border border-[#E5E1D8] rounded-lg text-sm focus:outline-none focus:border-[#5A5A40] appearance-none mb-3"
                       >
                         <option value="default">默认白底</option>
                         <option value="color">纯色背景</option>
                         <option value="image">图片背景</option>
                       </select>

                       {settingsForm.chatBackgroundMode === 'color' && (
                         <div>
                           <label className="block text-[11px] font-bold text-[#A6A298] uppercase tracking-tighter mb-1.5">背景颜色</label>
                           <input type="color" value={settingsForm.chatBackgroundColor || '#ffffff'} onChange={e => setSettingsForm({...settingsForm, chatBackgroundColor: e.target.value})} className="w-full h-10 p-1 bg-white border border-[#E5E1D8] rounded-lg" />
                         </div>
                       )}

                       {settingsForm.chatBackgroundMode === 'image' && (
                         <div>
                           <label className="block text-[11px] font-bold text-[#A6A298] uppercase tracking-tighter mb-1.5">背景图片URL / Base64</label>
                           <input type="text" placeholder="粘贴图片URL..." value={settingsForm.chatBackgroundImage || ''} onChange={e => setSettingsForm({...settingsForm, chatBackgroundImage: e.target.value})} className="w-full p-2.5 bg-white border border-[#E5E1D8] rounded-lg text-sm focus:outline-none focus:border-[#5A5A40]" />
                           <input type="file" accept="image/*" className="mt-2 text-xs" onChange={(e) => {
                             const file = e.target.files?.[0];
                             if (file) {
                               const reader = new FileReader();
                               reader.onload = (ev) => setSettingsForm({...settingsForm, chatBackgroundImage: ev.target?.result as string});
                               reader.readAsDataURL(file);
                             }
                           }} />
                         </div>
                       )}
                    </div>
                  </>
                )}
              </form>
            </div>
            <div className="p-5 bg-white border-t border-[#E5E1D8] flex justify-end gap-3">
              <button type="button" onClick={() => setIsSettingsOpen(false)} className="px-5 py-2 text-[#5A5A40] hover:bg-[#F5F5F0] rounded-xl text-sm font-medium transition-colors">
                取消
              </button>
              <button type="submit" form="settings-form" className="px-5 py-2 bg-[#5A5A40] text-white rounded-xl text-sm font-medium hover:bg-[#4A4A35] transition-colors">
                保存设置
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #cbd5e1;
          border-radius: 10px;
        }
        .fade-in {
          animation: fadeIn 0.3s ease-in;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

