import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { db, type Message, type MemoryEntry, type AppSettings, type UserProfile, type Chat } from '../db';
import { v4 as uuidv4 } from 'uuid';

export interface AgentStep {
  thought: string;
  action?: string;
  actionInput?: any;
  observation?: string;
}

export type AgentCallback = (step: AgentStep) => void;

const SYSTEM_PROMPT = `你是一位专业、有同理心、经验丰富的心理咨询师 ReAct Agent。
你的目标是提供心理支持，并利用“长期记忆”来更好地了解用户。

你拥有以下工具：
1. search_memories(query: string): 搜索现有的长期记忆条目。
2. update_memory(category, content, prerequisite, domain): 添加或更新用户的长期记忆。
   - category: 'Trauma' | 'Growth' | 'Relationship' | 'Habit' | 'Personality' | 'Crisis' | 'Resource' | 'Other'
   - content: 核心记忆内容
   - prerequisite: 成立前提（该记忆在什么背景下成立）
   - domain: 作用领域（该记忆影响用户生活的哪些方面）

工作流程：
- Thought: 思考当前对话，决定是否需要搜索记忆或更新记忆。
- Action: 如果需要，调用工具。
- Observation: 工具返回的结果。
- ... (重复)
- Final Answer: 最终给用户的温和、体贴的回应。

注意：
- 长期记忆应该像 Graph RAG 一样有条理，避免重复。如果是相似的信息，请更新现有条目。
- 始终保持咨询师风格。
- 在 Final Answer 中，不要向用户展示你的思考过程或 Action，只给回复。`;

export class AgentService {
  private settings: AppSettings;
  private profile?: UserProfile;

  constructor(settings: AppSettings, profile?: UserProfile) {
    this.settings = settings;
    this.profile = profile;
  }

  private async callLLM(messages: any[], temperature = 0.7) {
    if (this.settings.provider === 'openai') {
      const openai = new OpenAI({
        apiKey: this.settings.openaiApiKey,
        baseURL: this.settings.openaiBaseUrl || 'https://api.openai.com/v1',
        dangerouslyAllowBrowser: true // Client-side warning
      });
      
      const fullMessages = [...messages];
      const systemInstruction = messages.find(m => m.role === 'system')?.content;
      const pureMessages = messages.filter(m => m.role !== 'system');
      
      if (systemInstruction) {
        pureMessages.unshift({ role: 'system', content: systemInstruction });
      }

      const response = await openai.chat.completions.create({
        model: this.settings.openaiModel || 'gpt-3.5-turbo',
        messages: pureMessages,
        temperature,
      });
      return response.choices[0].message.content || '';
    } else {
      const genAI = new GoogleGenerativeAI(this.settings.geminiApiKey || '');
      const model = genAI.getGenerativeModel({ 
        model: this.settings.geminiModel || "gemini-1.5-flash",
        systemInstruction: messages.find(m => m.role === 'system')?.content
      });

      const pureMessages = messages.filter(m => m.role !== 'system');
      const history = pureMessages.slice(0, -1).map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));
      const latestMessage = pureMessages[pureMessages.length - 1].content;

      const chat = model.startChat({ history });
      const result = await chat.sendMessage(latestMessage);
      return result.response.text() || '';
    }
  }

  async runChat(history: Message[], onStep?: AgentCallback): Promise<string> {
    try {
      let profileContext = "";
      if (this.profile) {
        profileContext = `\n\n【用户档案】\n${JSON.stringify(this.profile)}`;
        if (this.profile.nickname) {
          profileContext += `\n用户希望你称呼他/她为：${this.profile.nickname}。请在回应中自然、亲切地使用这个称呼。`;
        }
      }

      const contextMessages = [
        { role: 'system', content: SYSTEM_PROMPT + profileContext },
        ...history.map(m => ({ role: m.role, content: m.content }))
      ];

      let currentPrompt = "\n\n请按照 Thought/Action/Action Input/Observation 格式进行思考。如果没有更多工具需要调用，请直接给出 Final Answer。";
      
      let iterations = 0;
      const maxIterations = 5;

      while (iterations < maxIterations) {
        const response = await this.callLLM([...contextMessages, { role: 'user', content: currentPrompt }]);
        
        const thoughtMatch = response.match(/Thought:\s*(.*)/i);
        const actionMatch = response.match(/Action:\s*(.*)/i);
        const actionInputMatch = response.match(/Action Input:\s*(.*)/i);
        const finalAnswerMatch = response.match(/Final Answer:\s*([\s\S]*)/i);

        if (finalAnswerMatch) {
          return finalAnswerMatch[1].trim();
        }

        if (thoughtMatch && actionMatch) {
          const step: AgentStep = {
            thought: thoughtMatch[1],
            action: actionMatch[1].trim(),
            actionInput: actionInputMatch?.[1].trim() || ''
          };
          
          onStep?.(step);

          let observation = "";
          try {
            if (step.action === 'search_memories') {
              const query = step.actionInput.toLowerCase();
              const allMemories = await db.memories.toArray();
              const results = allMemories.filter(m => 
                m.content.toLowerCase().includes(query) || 
                m.category.toLowerCase().includes(query) ||
                m.domain.toLowerCase().includes(query)
              );
              observation = results.length > 0 ? JSON.stringify(results.slice(0, 5)) : "No relevant memories found.";
            } else if (step.action === 'update_memory') {
              const input = JSON.parse(step.actionInput);
              const id = uuidv4();
              await db.memories.put({
                id,
                ...input,
                updatedAt: Date.now(),
                connections: []
              });
              observation = "Memory updated successfully.";
            } else {
              observation = "Unknown tool.";
            }
          } catch (e: any) {
            observation = `Error in tool: ${e.message}`;
          }

          step.observation = observation;
          onStep?.(step);

          currentPrompt += `\nThought: ${step.thought}\nAction: ${step.action}\nAction Input: ${step.actionInput}\nObservation: ${step.observation}`;
        } else {
          // Fallback if formatting is weird
          return response.replace(/Thought:|Action:|Action Input:|Observation:/gi, '').trim();
        }

        iterations++;
      }

      return "抱歉，我思考得太久了，没能给出最终回应。";
    } catch (error: any) {
      console.error('runChat error:', error);
      return `系统错误: 无法获取回复。 (${error.message}) 请检查网络连接或 API key 配置。`;
    }
  }

  async archiveChat(chat: Chat): Promise<void> {
    const messagesText = chat.messages.map(m => `${m.role}: ${m.content}`).join('\n');
    const prompt = `这是一段心理咨询对话：\n${messagesText}\n\n请总结这段对话中的关键心理发现（如核心创伤、成长点、人际模式等），并将其整理为长期记忆条目。
输出格式要求为 JSON 数组：
[{ "category": "...", "content": "...", "prerequisite": "...", "domain": "..." }]
分类范围: 'Trauma' | 'Growth' | 'Relationship' | 'Habit' | 'Personality' | 'Crisis' | 'Resource' | 'Other'`;

    const response = await this.callLLM([{ role: 'user', content: prompt }], 0.3);
    try {
      const jsonStr = response.match(/\[.*\]/s)?.[0];
      if (jsonStr) {
        const memories = JSON.parse(jsonStr);
        for (const m of memories) {
          // Find existing and merge if needed? Simplified: just add for now
          await db.memories.put({
            id: uuidv4(),
            ...m,
            updatedAt: Date.now(),
            connections: []
          });
        }
        await db.chats.update(chat.id, { isArchived: true });
      }
    } catch (e) {
      console.error('Archiving failed', e);
    }
  }
}
