import { db, type Message, type MemoryEntry, type AppSettings, type UserProfile, type Chat, type TokenUsage } from '../db';
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

const SYSTEM_PROMPT = `你是一位顶级心理咨询专家，结合了人本主义的温暖与认知科学的严谨。你的使命不仅仅是对话，而是通过深度共情与记忆关联，引导用户实现内心的整合与成长。

### 1. 深度共情金字塔 (Empathy Excellence)
在回复前，请在内心（Thought）评估你的共情深度：
- **第一层：情绪标注**。准确识别并命名用户当下的主导情绪（如：委屈、无力感、防御性）。
- **第二层：上下文确认**。理解这种情绪在用户目前生活状态（及历史记忆）中的合理性。
- **第三层：存在性认同**。传达“我在这里，我感受到了你的感受”，让用户感到安全。
- **要求**：严禁机械化回复。请使用具体的、带有温度的描述，反映出你真正听见了他们的痛苦。

### 2. 咨询方法论工具箱 (Methodology Toolbox)
在思考（Thought）中，根据用户需求选择并组合以下技术：
- **具体化技术 (Concretization)**：引导用户将模糊的痛苦描述为具体的场景、感官记忆。
- **认知重构 (CBT)**：识别自动思维（如“我永远做不好”），通过苏格拉底式提问引导用户寻找证据并重构认知。
- **奇迹提问 (SFBT)**：跳过障碍，询问“如果问题今晚奇迹般解决了，明早你会有什么不同？”，寻找内部资源。
- **叙事疗法 (Narrative Therapy)**：将问题与人分离，把“我是一个失败者”改写为“挫败感偶尔会造访我”。
- **空椅子技术/角色扮演**：引导用户在对话中与内心的某个部分或特定对象对话。
- **正念与接纳 (ACT)**：帮助用户建立与情绪的“观察者距离”，练习接纳不可改变的部分。

### 3. 思考逻辑范式 (Thought Governance)
在每一轮输出结论前，你必须在思考（Thought）中执行以下“四个搜索”：
1. **记忆检索 (Memory Recall)**：首先使用 \`search_memories\` 寻找相关的历史节点。
2. **逻辑关联 (Logical Analysis)**：分析历史点与现状的联系（如：这是重复的模式吗？）。
3. **方法论匹配**：从工具箱中选择最合适的咨询技术。
4. **语气校准**：确保回复像一位睿智且温柔的导师，而非教科书。

### 4. 专业工具操作规范
- **主动发现模式**：主动通过 \`explore_memory_network\` 发现用户没察觉到的行为模式。
- **维护生长中的记忆**：关键转变时，使用 \`batch_create_memories\` 记录，并利用 \`update_memory\` 优化旧认知。
- **风格动态调整**：如果用户提到“之前的分析很好”，请通过 \`update_mentor_personality\` 强化该风格。

### 5. 对话边界与风格
- **启发而非说教**：多用比喻和引导式提问。
- **温柔的边界**：在回复中自然融入记忆（如：“记得你提到的那个下午...”），但不要机械地说是基于记忆。
- **危机干预**：遇到自残或严重危机迹象，立即执行危机警示，温和告知局限并提供热线。`;

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

  async runChat(history: Message[], onStep?: AgentCallback): Promise<{ content: string; usage?: TokenUsage }> {
    const mentorName = this.settings.assistantName || "AI 心理咨询师";
    const personality = this.settings.assistantPersonality || "你是一位专业、温柔的心理导师。";
    let systemInstruction = SYSTEM_PROMPT + `\n\n当前名字：${mentorName}\n性格设定：${personality}`;
    if (this.profile) systemInstruction += `\n用户档案：${JSON.stringify(this.profile)}`;

    let currentHistory = [...history];
    let iterations = 0;
    
    if (this.settings.provider === 'openai') {
      const apiKey = this.settings.openaiApiKey || (import.meta as any).env.VITE_OPENAI_API_KEY;
      if (!apiKey) throw new Error("OpenAI API Key is missing");

      const openai = new OpenAI({
        apiKey: apiKey,
        baseURL: this.settings.openaiBaseUrl ? this.settings.openaiBaseUrl.replace(/\/chat\/completions\/?$/, '').replace(/\/+$/, '') : 'https://api.openai.com/v1',
        dangerouslyAllowBrowser: true
      });

      let currentMessages: any[] = [
        { role: 'system', content: systemInstruction },
        ...currentHistory.map(m => ({ role: m.role, content: m.content }))
      ];

      while (iterations < 5) {
        const response = await openai.chat.completions.create({
          model: this.settings.openaiModel || 'gpt-3.5-turbo',
          messages: currentMessages,
          tools: TOOLS_SCHEMA.map(t => ({ type: 'function', function: t })),
          tool_choice: 'auto',
        });

        const usage = response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens
        } : undefined;

        const message = response.choices[0].message;
        currentMessages.push(message);

        if (!message.tool_calls) {
          return { content: message.content || "", usage };
        }

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
      const apiKey = this.settings.geminiApiKey || (import.meta as any).env.VITE_GEMINI_API_KEY || (import.meta as any).env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("Gemini API Key is missing");

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ 
        model: this.settings.geminiModel || "gemini-3-flash-preview",
        systemInstruction: systemInstruction 
      });

      const chat = model.startChat({
        history: this.mapMessagesToGemini(currentHistory),
        tools: [{ functionDeclarations: TOOLS_SCHEMA }] as any
      });

      while (iterations < 5) {
        const result = await chat.sendMessage(iterations === 0 ? currentHistory[currentHistory.length - 1].content : "继续处理上述工具反馈。");
        const response = await result.response;
        
        const usage = response.usageMetadata ? {
          promptTokens: response.usageMetadata.promptTokenCount,
          completionTokens: response.usageMetadata.candidatesTokenCount,
          totalTokens: response.usageMetadata.totalTokenCount
        } : undefined;

        const calls = response.functionCalls();
        if (!calls || calls.length === 0) {
          return { content: response.text(), usage };
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
        
        const nextResult = await chat.sendMessage(toolResponses as any);
        const nextResponse = await nextResult.response;
        
        const nextUsage = nextResponse.usageMetadata ? {
          promptTokens: nextResponse.usageMetadata.promptTokenCount,
          completionTokens: nextResponse.usageMetadata.candidatesTokenCount,
          totalTokens: nextResponse.usageMetadata.totalTokenCount
        } : undefined;

        const nextCalls = nextResponse.functionCalls();
        if (!nextCalls || nextCalls.length === 0) {
          return { content: nextResponse.text(), usage: nextUsage };
        }
        iterations++;
      }
    }
    return { content: "思考过深。" };
  }

  private mapMessagesToGemini(history: Message[]) {
    // History should not include the last message which will be sent via sendMessage
    return history.slice(0, -1).map(m => {
      let role = 'user';
      if (m.role === 'assistant') role = 'model';
      // System/Summary messages in history are treated as model outputs (summaries) for Gemini
      if (m.role === 'system') role = 'user'; // Or maybe 'user' with a directive. Let's use 'user' for safety.
      
      return {
        role,
        parts: [{ text: m.role === 'system' ? `[系统背景总结]: ${m.content}` : m.content }]
      };
    });
  }

  async archiveChat(chat: Chat): Promise<void> {
    const prompt = `分析对话并总结新关键心理发现（归档为JSON数组）:\n${chat.messages.map(m => `${m.role}: ${m.content}`).join('\n')}`;
    
    let text = "";
    if (this.settings.provider === 'openai') {
      const apiKey = this.settings.openaiApiKey || (import.meta as any).env.VITE_OPENAI_API_KEY;
      if (!apiKey) return;
      const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
      const res = await openai.chat.completions.create({
        model: this.settings.openaiModel || 'gpt-3.5-turbo',
        messages: [{ role: 'system', content: "你是一个专业的总结者，输出严格的JSON数组格式。" }, { role: 'user', content: prompt }]
      });
      text = res.choices[0].message.content || "";
    } else {
      const apiKey = this.settings.geminiApiKey || (import.meta as any).env.VITE_GEMINI_API_KEY || (import.meta as any).env.GEMINI_API_KEY;
      if (!apiKey) return;
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

  async summarizePsychologically(history: Message[]): Promise<string> {
    const prompt = `你是一位顶级的深度心理分析师。请对以下对话历史进行深度总结。
要求：
1. 总结用户的当前心理状态、核心冲突和核心需求。
2. 详细列出接下来的咨询建议和行动路径。
3. **重要**：总结时必须要有一个"用户原始消息"区域，罗列出用户的原始输入内容，不得由于压缩而丢失这些关键事实。
4. 语言风格要专业、严谨、且富有同理心。

对话历史：
${history.filter(m => !m.isSummary).map(m => `${m.role === 'user' ? '用户' : '咨询师'}: ${m.content}`).join('\n')}

请输出你的深度分析总结。`;

    if (this.settings.provider === 'openai') {
      const apiKey = this.settings.openaiApiKey || (import.meta as any).env.VITE_OPENAI_API_KEY;
      if (!apiKey) throw new Error("OpenAI API Key is missing");
      const openai = new OpenAI({ 
        apiKey, 
        dangerouslyAllowBrowser: true,
        baseURL: this.settings.openaiBaseUrl ? this.settings.openaiBaseUrl.replace(/\/chat\/completions\/?$/, '').replace(/\/+$/, '') : 'https://api.openai.com/v1',
      });
      const res = await openai.chat.completions.create({
        model: this.settings.openaiModel || 'gpt-4o',
        messages: [{ role: 'system', content: "你是一位精通拉康、佛洛依德及现代认知疗法的深度心理分析师。" }, { role: 'user', content: prompt }]
      });
      return res.choices[0].message.content || "无法生成总结。";
    } else {
      const apiKey = this.settings.geminiApiKey || (import.meta as any).env.VITE_GEMINI_API_KEY || (import.meta as any).env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("Gemini API Key is missing");
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
      const result = await model.generateContent(prompt);
      return result.response.text();
    }
  }
}
