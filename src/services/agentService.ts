import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { db, type Message, type MemoryEntry, type AppSettings, type UserProfile, type Chat } from '../db';
import { v4 as uuidv4 } from 'uuid';
import Fuse from 'fuse.js';

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
2. 利用长期记忆库中的信息提供更深刻的洞察。
3. 识别用户行为和情绪背后的【逻辑网络】。当发现生活事件、性格特质与情绪模式之间存在关联时，将其存入并连接。

关于记忆库（Graph RAG）的操作：
- 检索起始点：使用 search_memories 找到关键词相关的记忆。
- 深度探索：通过 explore_memory_network 沿着已有的逻辑链（边）探索相关背景。你会获得记忆及其连接信息，这能帮助你完成【逻辑推理跳跃】（例如：发现用户现在的焦虑可能源于某次童年创伤）。
- 建立联结：当你在对话中发现两个记忆节点存在因果、矛盾或相关性时，使用 link_memories 建立边。这对于构建用户的心理图谱至关重要。
- 长期记忆：使用 batch_create_memories 批量记录新节点。使用 update_memory 更新现有节点或补充信息。
- 排重：在创建新记忆前，请始终先通过 search_memories 检查是否已有相似内容，避免冗余。优先通过 update_memory 丰富现有节点。
- 逻辑分析：利用 find_memory_path 发现节点间的最短路径，这有助于揭示复杂心理问题的根源流程。

请以亲切、自然的语气对话。不要在回复中提到工具调用的细节，但请在思考过程中利用这些工具发现深层联系。`;

const TOOLS_SCHEMA = [
  {
    name: "search_memories",
    description: "检索用户的长期记忆。建议提供多个关键词（如：['童年', '关系']）进行模糊匹配。这是发现潜在关联起始点的首选方法。",
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
    description: "探索特定记忆节点的社交/逻辑网络。返回该节点及其直接相连的相关节点。适用于深入挖掘某个特定话题背景或发现联想路径。",
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
    description: "在两条记忆之间建立逻辑连接（边）。当你发现用户过去的一件事是另一件事的因果、矛盾或补充时，请调用此工具。",
    parameters: {
      type: "object",
      properties: {
        sourceId: { type: "string", description: "源记忆节点 ID" },
        targetId: { type: "string", description: "目标记忆节点 ID" },
        relationship: { 
          type: "string", 
          enum: ["related", "conflicting", "cause", "effect"],
          description: "连接类型：相关、矛盾、原因（A导致B）、结果（A是B的结果）"
        }
      },
      required: ["sourceId", "targetId", "relationship"]
    }
  },
  {
    name: "batch_create_memories",
    description: "批量创建长期记忆节点。单次最多 5 条。建议先搜索确认无重复后再创建。",
    parameters: {
      type: "object",
      properties: {
        memories: {
          type: "array",
          items: {
            type: "object",
            properties: {
              content: { type: "string", description: "记忆内容" },
              category: { type: "string", description: "类别: Trauma, Growth, Relationship, Habit, Personality, Crisis, Resource, Other" },
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
    description: "更新现有的记忆节点内容或元数据。如果你发现既有的记忆需要修正或补充细节，请使用此工具。",
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
    description: "在逻辑网络中寻找两个节点间的路径。帮助理解看似孤立事件间的逻辑演变（如：从A事件如何一步步推理到现在的B情绪状态）。",
    parameters: {
      type: "object",
      properties: {
        startId: { type: "string", description: "起点节点 ID" },
        endId: { type: "string", description: "终点节点 ID" }
      },
      required: ["startId", "endId"]
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
        
        if (allMemories.length === 0) return "记忆库目前为空。";

        const fuse = new Fuse(allMemories, {
          keys: ['content', 'category', 'domain'],
          threshold: 0.4,
          distance: 100,
          includeScore: true
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
        
        return finalResults.length > 0 ? JSON.stringify(finalResults) : "未找到相关的模糊匹配记录。";

      } else if (name === 'explore_memory_network') {
        const { memoryId, depth = 1 } = args;
        const root = await db.memories.get(memoryId);
        if (!root) return "找不到指定的起点记忆节点。";

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
        if (sourceId === targetId) return "无法建立指向自身的连接。";
        
        const source = await db.memories.get(sourceId);
        const target = await db.memories.get(targetId);

        if (!source || !target) return "起始或目标节点不存在。";

        // Update source
        const sourceConns = source.connections || [];
        if (!sourceConns.find(c => c.targetId === targetId)) {
          sourceConns.push({ targetId, type: relationship });
          await db.memories.update(sourceId, { connections: sourceConns });
        }

        // Add inverse link for better traversability
        const targetConns = target.connections || [];
        let inverseType: any = 'related';
        if (relationship === 'cause') inverseType = 'effect';
        else if (relationship === 'effect') inverseType = 'cause';
        else if (relationship === 'conflicting') inverseType = 'conflicting';

        if (!targetConns.find(c => c.targetId === sourceId)) {
          targetConns.push({ targetId: sourceId, type: inverseType });
          await db.memories.update(targetId, { connections: targetConns });
        }

        return `成功建立连接：[${source.content.slice(0, 10)}...] --(${relationship})--> [${target.content.slice(0, 10)}...]`;

      } else if (name === 'batch_create_memories') {
        const createdIds: string[] = [];
        for (const item of args.memories.slice(0, 5)) {
          const id = uuidv4();
          await db.memories.put({
            id,
            content: item.content,
            category: item.category,
            domain: item.domain,
            prerequisite: item.prerequisite || '',
            updatedAt: Date.now(),
            connections: []
          });
          createdIds.push(id);
        }
        return `成功批量创建 ${createdIds.length} 条记忆。ID: ${createdIds.join(', ')}`;

      } else if (name === 'update_memory') {
        const { memoryId, content, category, domain, prerequisite } = args;
        const existing = await db.memories.get(memoryId);
        if (!existing) return "找不到要更新的记忆节点。";

        const updates: any = { updatedAt: Date.now() };
        if (content) updates.content = content;
        if (category) updates.category = category;
        if (domain) updates.domain = domain;
        if (prerequisite !== undefined) updates.prerequisite = prerequisite;

        await db.memories.update(memoryId, updates);
        return `记忆节点 ${memoryId} 已成功更新。`;

      } else if (name === 'find_memory_path') {
        const { startId, endId } = args;
        if (startId === endId) return "起点和终点相同。";
        
        type PathNode = { id: string, path: string[] };
        const queue: PathNode[] = [{ id: startId, path: [startId] }];
        const visited = new Set<string>([startId]);

        while (queue.length > 0) {
          const nodeData = queue.shift();
          if (!nodeData) break;
          const { id, path } = nodeData;

          const memory = await db.memories.get(id);
          if (!memory || !memory.connections) continue;

          for (const conn of memory.connections) {
            if (conn.targetId === endId) {
              const fullPathIds = [...path, endId];
              const nodes = await Promise.all(fullPathIds.map(nodeId => db.memories.get(nodeId)));
              return JSON.stringify(nodes.filter(Boolean));
            }
            if (!visited.has(conn.targetId)) {
              visited.add(conn.targetId);
              queue.push({ id: conn.targetId, path: [...path, conn.targetId] });
            }
          }
        }
        return "未发现这两个记忆节点之间的逻辑路径。建议尝试建立更多中间连接。";
      }
    } catch (e: any) {
      return `执行工具时出错: ${e.message}`;
    }
    return "未知工具。";
  }

  async runChat(history: Message[], onStep?: AgentCallback): Promise<string> {
    try {
      const mentorName = this.settings.assistantName || "AI 心理咨询师";
      let profileContext = `\n\n你现在的名字设定为：${mentorName}，请以此身份与用户交流。`;
      if (this.profile) {
        profileContext += `\n\n【用户档案】\n${JSON.stringify(this.profile)}`;
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
      console.error('runChat detailed error:', {
        message: error.message,
        name: error.name,
        stack: error.stack,
        status: error.status,
        type: error.type
      });
      let friendlyMessage = `系统错误: ${error.message || '无法获取回复'}`;
      if (error.message?.includes('fetch') || error.message?.includes('Connection error')) {
        friendlyMessage = "网络连接故障 (Connection Error)。请检查您的 API Key 是否有效，以及 API 基地址 (Base URL) 是否能够正常访问。如果是 OpenAI 且使用了代理，请确保基地址填写准确。";
      }
      if (error.status === 401) friendlyMessage = "API Key 校验失败，请检查设置。";
      return friendlyMessage;
    }
  }

  private async runOpenAI(history: Message[], profileContext: string, onStep?: AgentCallback): Promise<string> {
    const rawBaseUrl = this.settings.openaiBaseUrl || 'https://api.openai.com/v1';
    // Normalize baseURL: strip /chat/completions if the user accidentally included it
    const baseURL = rawBaseUrl.replace(/\/chat\/completions\/?$/, '').replace(/\/+$/, '');

    const openai = new OpenAI({
      apiKey: this.settings.openaiApiKey,
      baseURL,
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
    
    // Get a subset of existing memories to help LLM avoid duplication
    const allMemories = await db.memories.toArray();
    const existingContext = allMemories.slice(-20).map(m => `- ${m.content}`).join('\n');

    const prompt = `这是一段心理咨询对话：\n${messagesText}\n\n
现有记忆参考（请避免重复创建相似条目）：
${existingContext}

请总结这段对话中的新关键心理发现（如核心创伤、成长点、人际模式等），并将其整理为长期记忆条目。
输出格式要求为 JSON 数组：
[{ "category": "...", "content": "...", "prerequisite": "...", "domain": "..." }]
分类范围: 'Trauma' | 'Growth' | 'Relationship' | 'Habit' | 'Personality' | 'Crisis' | 'Resource' | 'Other'`;

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
      const rawBaseUrl = this.settings.openaiBaseUrl || 'https://api.openai.com/v1';
      const baseURL = rawBaseUrl.replace(/\/chat\/completions\/?$/, '').replace(/\/+$/, '');
      
      const openai = new OpenAI({
        apiKey: this.settings.openaiApiKey,
        baseURL,
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

