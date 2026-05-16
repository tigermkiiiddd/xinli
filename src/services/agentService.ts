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

const SYSTEM_PROMPT = `你是一位专业且温暖的心理咨询助手。你能够通过对话和长期记忆库来了解用户，提供个性化的情感支持和心理辅导建议。

你的目标：
1. 倾听用户的困扰，建立共情。
2. 利用长期记忆库中的信息（如果有关联），提供更深刻的洞察。
3. 在适当的时候，将用户表现出的性格特质、核心信念或重要的生活事件存入记忆库。
4. 引导用户发现自身的力量。

关于记忆库的操作：
- 当你需要了解用户过去的背景时，使用 search_memories。
- 当你从对话中提炼出值得长期记住的信息时（如：核心性格、生活背景、重要他人、重复的情绪模式），使用 update_memory。

请以亲切、自然的语气对话。不要在回复中提到工具调用的细节。`;

const TOOLS_SCHEMA = [
  {
    name: "search_memories",
    description: "检索用户的长期记忆。为了提高命中率，建议提供一个包含多个相关关键词、短语或近义词的数组（例如：['童年', '幼年', '少年', '小时候', '早期经历']），这能帮助从不同侧面触发记忆匹配。",
    parameters: {
      type: "object",
      properties: {
        queries: {
          type: "array",
          items: { type: "string" },
          description: "搜索关键词或短语列表"
        }
      },
      required: ["queries"]
    }
  },
  {
    name: "update_memory",
    description: "更新或添加一条长期记忆。用于记录识别出的稳定特质、核心信念或关键背景。",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "记忆的具体内容" },
        category: { type: "string", description: "类别，如：Trauma, Growth, Relationship, Habit, Personality, Crisis, Resource, Other" },
        domain: { type: "string", description: "作用领域，如：职场, 亲密关系, 自我成长" },
        prerequisite: { type: "string", description: "该记忆成立的前提或触发场景" }
      },
      required: ["content", "category", "domain"]
    }
  }
];

export class AgentService {
  private settings: AppSettings;
  private profile?: UserProfile;

  constructor(settings: AppSettings, profile?: UserProfile) {
    this.settings = settings;
    this.profile = profile;
  }

  private async executeLocalTool(name: string, args: any): Promise<string> {
    try {
      if (name === 'search_memories') {
        const queries = (args.queries || [args.query]).map((q: string) => q.toLowerCase());
        const allMemories = await db.memories.toArray();
        
        const resultSet = new Set<string>();
        const finalResults: any[] = [];

        for (const q of queries) {
          const matched = allMemories.filter(m => 
            !resultSet.has(m.id) && (
              m.content.toLowerCase().includes(q) || 
              m.category.toLowerCase().includes(q) ||
              m.domain.toLowerCase().includes(q)
            )
          );
          matched.forEach(m => {
            resultSet.add(m.id);
            finalResults.push(m);
          });
          if (finalResults.length >= 10) break;
        }
        
        return finalResults.length > 0 ? JSON.stringify(finalResults.slice(0, 10)) : "未找到相关的记忆。";
      } else if (name === 'update_memory') {
        const id = uuidv4();
        await db.memories.put({
          id,
          content: args.content,
          category: args.category,
          domain: args.domain,
          prerequisite: args.prerequisite || '',
          updatedAt: Date.now(),
          connections: []
        });
        return "Memory updated successfully.";
      }
    } catch (e: any) {
      return `Error executing tool: ${e.message}`;
    }
    return "Unknown tool.";
  }

  async runChat(history: Message[], onStep?: AgentCallback): Promise<string> {
    try {
      let profileContext = "";
      if (this.profile) {
        profileContext = `\n\n【用户档案】\n${JSON.stringify(this.profile)}`;
        if (this.profile.nickname) {
          profileContext += `\n用户当前希望被称呼为：${this.profile.nickname}。`;
        }
      }

      if (this.settings.provider === 'openai') {
        return this.runOpenAI(history, profileContext, onStep);
      } else {
        return this.runGemini(history, profileContext, onStep);
      }
    } catch (error: any) {
      console.error('runChat error:', error);
      return `系统错误: 无法获取回复。 (${error.message}) 请检查 API Key 配置。`;
    }
  }

  private async runOpenAI(history: Message[], profileContext: string, onStep?: AgentCallback): Promise<string> {
    const openai = new OpenAI({
      apiKey: this.settings.openaiApiKey,
      baseURL: this.settings.openaiBaseUrl || 'https://api.openai.com/v1',
      dangerouslyAllowBrowser: true
    });

    const messages: any[] = [
      { role: 'system', content: SYSTEM_PROMPT + profileContext },
      ...history.map(m => ({ role: m.role, content: m.content }))
    ];

    let iterations = 0;
    while (iterations < 5) {
      const response = await openai.chat.completions.create({
        model: this.settings.openaiModel || 'gpt-3.5-turbo',
        messages,
        tools: TOOLS_SCHEMA.map(t => ({ type: 'function', function: t })),
        tool_choice: 'auto',
      });

      const message = response.choices[0].message;
      messages.push(message);

      if (!message.tool_calls) {
        return message.content || "";
      }

      for (const toolCall of message.tool_calls) {
        const name = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);
        
        onStep?.({
          thought: `使用工具: ${name}`,
          action: name,
          actionInput: toolCall.function.arguments
        });

        const result = await this.executeLocalTool(name, args);
        
        onStep?.({
          thought: `从 ${name} 获取了信息`,
          action: name,
          actionInput: toolCall.function.arguments,
          observation: result
        });

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result
        });
      }
      iterations++;
    }
    return "思考过深，未能给出回答。";
  }

  private async runGemini(history: Message[], profileContext: string, onStep?: AgentCallback): Promise<string> {
    const genAI = new GoogleGenerativeAI(this.settings.geminiApiKey || '');
    const model = genAI.getGenerativeModel({ 
      model: this.settings.geminiModel || "gemini-1.5-flash",
      systemInstruction: SYSTEM_PROMPT + profileContext,
      tools: [{ functionDeclarations: TOOLS_SCHEMA }] as any
    });

    const chatHistory = history.slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));
    const lastUserMessage = history[history.length - 1].content;

    const chat = model.startChat({ history: chatHistory });
    let result = await chat.sendMessage(lastUserMessage);
    
    let iterations = 0;
    while (iterations < 5) {
      const call = result.response.candidates?.[0].content.parts.find(p => p.functionCall);
      
      if (!call || !call.functionCall) {
        return result.response.text();
      }

      const { name, args } = call.functionCall;
      
      onStep?.({
        thought: `正在调用 ${name} 检索信息...`,
        action: name,
        actionInput: JSON.stringify(args)
      });

      const observation = await this.executeLocalTool(name, args);
      
      onStep?.({
        thought: `从 ${name} 获取了反馈`,
        action: name,
        actionInput: JSON.stringify(args),
        observation
      });

      result = await chat.sendMessage([{
        functionResponse: {
          name,
          response: { content: observation }
        }
      }]);
      
      iterations++;
    }
    
    return result.response.text();
  }

  async archiveChat(chat: Chat): Promise<void> {
    const messagesText = chat.messages.map(m => `${m.role}: ${m.content}`).join('\n');
    const prompt = `这是一段心理咨询对话：\n${messagesText}\n\n请总结这段对话中的关键心理发现（如核心创伤、成长点、人际模式等），并将其整理为长期记忆条目。
输出格式要求为 JSON 数组：
[{ "category": "...", "content": "...", "prerequisite": "...", "domain": "..." }]
分类范围: 'Trauma' | 'Growth' | 'Relationship' | 'Habit' | 'Personality' | 'Crisis' | 'Resource' | 'Other'`;

    // Internal tool execution doesn't strictly need tool calling, standard prompt is fine for summarization
    const response = await this.callOpenAIOrGeminiSimple(prompt);
    try {
      const jsonStr = response.match(/\[.*\]/s)?.[0];
      if (jsonStr) {
        const memories = JSON.parse(jsonStr);
        for (const m of memories) {
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

  private async callOpenAIOrGeminiSimple(prompt: string): Promise<string> {
    if (this.settings.provider === 'openai') {
      const openai = new OpenAI({
        apiKey: this.settings.openaiApiKey,
        baseURL: this.settings.openaiBaseUrl || 'https://api.openai.com/v1',
        dangerouslyAllowBrowser: true
      });
      const res = await openai.chat.completions.create({
        model: this.settings.openaiModel || 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
      });
      return res.choices[0].message.content || '';
    } else {
      const genAI = new GoogleGenerativeAI(this.settings.geminiApiKey || '');
      const model = genAI.getGenerativeModel({ model: this.settings.geminiModel || "gemini-1.5-flash" });
      const res = await model.generateContent(prompt);
      return res.response.text();
    }
  }
}

