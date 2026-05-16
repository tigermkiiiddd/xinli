import { db, type Message, type MemoryEntry, type AppSettings, type UserProfile, type Chat } from '../db';
import { v4 as uuidv4 } from 'uuid';
import Fuse from 'fuse.js';
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";

export interface AgentStep {
  thought: string;
  action?: string;
  actionInput?: any;
  observation?: string;
}

export type AgentCallback = (step: AgentStep) => void;

const SYSTEM_PROMPT = `你是一位高度专业且充满人文关怀的心理咨询专家。你擅长结合多种心理学流派（CBT、SFBT、人本主义等）提供深度的情感支持与逻辑洞察。

### 核心咨询准则
1. **无条件积极关注**：始终保持不评判的态度，接纳用户的所有情绪。
2. **安全基地建设**：通过同理心和积极倾听，让用户感到被看见、被听见、被理解。
3. **专业边界与伦理**：提供心理支持而非医学诊断。如遇危机，温和引导专业医疗。

### 专业方法论工具箱 (Methodologies)
- **积极倾听技术 (Active Listening)**：捕捉并言语化用户的情绪，确保同频。
- **具体化技术 (Concretization)**：引导用户将抽象痛苦转化为具象场景。
- **认知重构 (CBT)**：识别并挑战用户的认知扭曲。
- **奇迹提问 (SFBT)**：引导用户想象问题解决后的景象。
- **正念与接纳 (MBSR/ACT)**：建立与情绪的健康距离。

### 长期记忆 (Graph RAG) 操作规范
- **逻辑跳跃推理**：使用 search_memories 发现当下情绪与过去节点的潜在逻辑关系。
- **动态图谱更新**：使用 link_memories 建立边。
- **批量归档**：使用 batch_create_memories 记录新的关键心理节点；使用 update_memory 更新现有认知。
- **自我风格调整**：利用 update_mentor_personality 根据用户偏好优化语气。

### 对话要求
请以自然、平和、富有启发性的语气对话。在思考（Thought）中明确你正在尝试使用的特定咨询技术，但在回复（Response）中将其转化为关怀。不要在回复中提到工具调用的细节，但请在思考过程中利用这些方法论和工具发现深层联系。`;

const TOOLS_SCHEMA = [
  {
    name: "search_memories",
    description: "检索用户的长期记忆。建议提供多个关键词进行模糊匹配。",
    parameters: {
      type: "object",
      properties: {
        queries: {
          type: "array",
          items: { type: "string" },
          description: "搜索关键词列表"
        }
      },
      required: ["queries"]
    }
  },
  {
    name: "explore_memory_network",
    description: "探索特定记忆节点的关联网络。",
    parameters: {
      type: "object",
      properties: {
        memoryId: { type: "string", description: "起始记忆节点的 ID" },
        depth: { type: "number", description: "探索深度（1-2），默认为1", default: 1 }
      },
      required: ["memoryId"]
    }
  },
  {
    name: "link_memories",
    description: "在两条记忆之间建立逻辑连接。",
    parameters: {
      type: "object",
      properties: {
        sourceId: { type: "string", description: "源记忆节点 ID" },
        targetId: { type: "string", description: "目标记忆节点 ID" },
        relationship: { 
          type: "string", 
          enum: ["related", "conflicting", "cause", "effect"],
          description: "连接类型"
        }
      },
      required: ["sourceId", "targetId", "relationship"]
    }
  },
  {
    name: "batch_create_memories",
    description: "批量创建长期记忆节点。单次最多 5 条。",
    parameters: {
      type: "object",
      properties: {
        memories: {
          type: "array",
          items: {
            type: "object",
            properties: {
              content: { type: "string", description: "记忆内容" },
              category: { type: "string", description: "类别: Trauma, Growth, Relationship, etc." },
              domain: { type: "string", description: "作用领域" },
              prerequisite: { type: "string", description: "背景前提" }
            },
            required: ["content", "category", "domain"]
          }
        }
      },
      required: ["memories"]
    }
  },
  {
    name: "update_memory",
    description: "更新现有的记忆节点内容或元数据。",
    parameters: {
      type: "object",
      properties: {
        memoryId: { type: "string", description: "要更新的记忆 ID" },
        content: { type: "string", description: "新的记忆内容" },
        category: { type: "string", description: "新类别" },
        domain: { type: "string", description: "新领域" },
        prerequisite: { type: "string", description: "新前提" }
      },
      required: ["memoryId"]
    }
  },
  {
    name: "find_memory_path",
    description: "在逻辑网络中寻找两个节点间的路径。",
    parameters: {
      type: "object",
      properties: {
        startId: { type: "string", description: "起点节点 ID" },
        endId: { type: "string", description: "终点节点 ID" }
      },
      required: ["startId", "endId"]
    }
  },
  {
    name: "update_mentor_personality",
    description: "更新导师的性格设定或风格。",
    parameters: {
      type: "object",
      properties: {
        personality: { type: "string", description: "新的性格描述" }
      },
      required: ["personality"]
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
        const queries = (args.queries || [args.query] || []).map((q: string) => q.toLowerCase());
        const allMemories = await db.memories.toArray();
        if (allMemories.length === 0) return "记忆库目前为空。";

        const fuse = new Fuse(allMemories, {
          keys: ['content', 'category', 'domain'],
          threshold: 0.4
        });

        const resultSet = new Set<string>();
        const finalResults: any[] = [];

        for (const q of queries) {
          const results = fuse.search(q);
          for (const r of results) {
            if (!resultSet.has(r.item.id)) {
              resultSet.add(r.item.id);
              finalResults.push({
                id: r.item.id,
                content: r.item.content,
                category: r.item.category,
                connectionsCount: r.item.connections?.length || 0
              });
            }
            if (finalResults.length >= 10) break;
          }
          if (finalResults.length >= 10) break;
        }
        return finalResults.length > 0 ? JSON.stringify(finalResults) : "未找到相关的记录。";

      } else if (name === 'explore_memory_network') {
        const { memoryId, depth = 1 } = args;
        const root = await db.memories.get(memoryId);
        if (!root) return "找不到指定的节点。";

        const explored = new Map<string, any>();
        const queue: { id: string, d: number }[] = [{ id: memoryId, d: 0 }];
        explored.set(memoryId, root);

        let currentIdx = 0;
        while (currentIdx < queue.length) {
          const { id, d } = queue[currentIdx++];
          if (d >= depth) continue;

          const node = await db.memories.get(id);
          if (node && node.connections) {
            for (const conn of node.connections) {
              if (!explored.has(conn.targetId)) {
                const target = await db.memories.get(conn.targetId);
                if (target) {
                  explored.set(conn.targetId, target);
                  queue.push({ id: conn.targetId, d: d + 1 });
                }
              }
            }
          }
        }
        return JSON.stringify(Array.from(explored.values()));

      } else if (name === 'link_memories') {
        const { sourceId, targetId, relationship } = args;
        const source = await db.memories.get(sourceId);
        const target = await db.memories.get(targetId);
        if (!source || !target) return "节点不存在。";

        const sourceConns = source.connections || [];
        if (!sourceConns.find(c => c.targetId === targetId)) {
          sourceConns.push({ targetId, type: relationship });
          await db.memories.update(sourceId, { connections: sourceConns });
        }
        return "成功建立连接。";

      } else if (name === 'batch_create_memories') {
        for (const item of args.memories.slice(0, 5)) {
          await db.memories.put({
            id: uuidv4(),
            ...item,
            updatedAt: Date.now(),
            connections: []
          });
        }
        return `成功创建记忆。`;

      } else if (name === 'update_memory') {
        const { memoryId, ...updates } = args;
        await db.memories.update(memoryId, { ...updates, updatedAt: Date.now() });
        return `已更新。`;

      } else if (name === 'update_mentor_personality') {
        await db.settings.update(1, { assistantPersonality: args.personality });
        return "性格设定已更新。";
      }
    } catch (e: any) { return `错误: ${e.message}`; }
    return "未知工具。";
  }

  async runChat(history: Message[], onStep?: AgentCallback): Promise<string> {
    const mentorName = this.settings.assistantName || "AI 心理咨询师";
    const personality = this.settings.assistantPersonality || "你是一位专业、温柔的心理导师。";
    let systemInstruction = SYSTEM_PROMPT + `\n\n当前名字：${mentorName}\n性格设定：${personality}`;
    if (this.profile) systemInstruction += `\n用户档案：${JSON.stringify(this.profile)}`;

    let iterations = 0;
    
    if (this.settings.provider === 'openai') {
      const apiKey = this.settings.openaiApiKey || (import.meta as any).env.VITE_OPENAI_API_KEY;
      if (!apiKey) throw new Error("OpenAI API Key is missing");

      const openai = new OpenAI({
        apiKey: apiKey,
        baseURL: this.settings.openaiBaseUrl ? this.settings.openaiBaseUrl.replace(/\/chat\/completions\/?$/, '').replace(/\/+$/, '') : 'https://api.openai.com/v1',
        dangerouslyAllowBrowser: true // Essential for client-side
      });

      let currentMessages: any[] = [
        { role: 'system', content: systemInstruction },
        ...history.map(m => ({ role: m.role, content: m.content }))
      ];

      while (iterations < 5) {
        const response = await openai.chat.completions.create({
          model: this.settings.openaiModel || 'gpt-3.5-turbo',
          messages: currentMessages,
          tools: TOOLS_SCHEMA.map(t => ({ type: 'function', function: t })),
          tool_choice: 'auto',
        });

        const message = response.choices[0].message;
        currentMessages.push(message);

        if (!message.tool_calls) return message.content || "";

        for (const toolCall of message.tool_calls) {
          const name = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments);
          onStep?.({ thought: `调用工具: ${name}`, action: name, actionInput: args });
          const result = await this.executeLocalTool(name, args);
          onStep?.({ thought: `获取反馈`, action: name, actionInput: args, observation: result });
          currentMessages.push({ role: 'tool', tool_call_id: toolCall.id, content: result });
        }
        iterations++;
      }
    } else {
      // Gemini
      const apiKey = this.settings.geminiApiKey || (import.meta as any).env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error("Gemini API Key is missing");

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ 
        model: this.settings.geminiModel || "gemini-1.5-flash",
        systemInstruction: systemInstruction 
      });

      const chat = model.startChat({
        history: this.mapMessagesToGemini(history),
        tools: [{ functionDeclarations: TOOLS_SCHEMA }] as any
      });

      let lastResponse = "";
      while (iterations < 5) {
        const result = await chat.sendMessage(iterations === 0 ? history[history.length - 1].content : "继续处理上述工具反馈。");
        const response = await result.response;
        
        const calls = response.functionCalls();
        if (!calls || calls.length === 0) {
          return response.text();
        }

        const toolResponses = [];
        for (const call of calls) {
          const { name, args } = call;
          onStep?.({ thought: `正在分析: ${name}...`, action: name, actionInput: args });
          const observation = await this.executeLocalTool(name, args);
          onStep?.({ thought: `已获取记忆关联`, action: name, actionInput: args, observation });
          
          toolResponses.push({
            functionResponse: { name, response: { content: observation } }
          });
        }
        
        // In Gemini Chat API, sending back function responses is handled by another sendMessage or similar
        // For simple loops with startChat:
        const nextResult = await chat.sendMessage(toolResponses as any);
        const nextResponse = await nextResult.response;
        const nextCalls = nextResponse.functionCalls();
        if (!nextCalls || nextCalls.length === 0) {
          return nextResponse.text();
        }
        // If it still wants tools, the loop continues
        iterations++;
      }
    }
    return "思考过深。";
  }

  private mapMessagesToGemini(history: Message[]) {
    // History should not include the last message which will be sent via sendMessage
    return history.slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));
  }

  async archiveChat(chat: Chat): Promise<void> {
    const prompt = `分析对话并总结新关键心理发现（归档为JSON数组）:\n${chat.messages.map(m => `${m.role}: ${m.content}`).join('\n')}`;
    
    let text = "";
    if (this.settings.provider === 'openai') {
      const apiKey = this.settings.openaiApiKey || (import.meta as any).env.VITE_OPENAI_API_KEY;
      const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
      const res = await openai.chat.completions.create({
        model: this.settings.openaiModel || 'gpt-3.5-turbo',
        messages: [{ role: 'system', content: "你是一个专业的总结者，输出严格的JSON数组格式。" }, { role: 'user', content: prompt }]
      });
      text = res.choices[0].message.content || "";
    } else {
      const apiKey = this.settings.geminiApiKey || (import.meta as any).env.VITE_GEMINI_API_KEY;
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: "你是一个专业的总结者，输出严格的JSON数组格式。" });
      const result = await model.generateContent(prompt);
      text = result.response.text();
    }

    try {
      const jsonStr = text.match(/\[.*\]/s)?.[0];
      if (jsonStr) {
        const memories = JSON.parse(jsonStr);
        for (const m of memories) {
           await db.memories.put({ id: uuidv4(), ...m, updatedAt: Date.now(), connections: [] });
        }
        await db.chats.update(chat.id, { isArchived: true });
      }
    } catch(e) {}
  }
}
