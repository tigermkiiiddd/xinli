import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Emotion Recognizer Module
async function recognizeEmotion(text: string, openai: OpenAI): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
      messages: [
        { 
          role: "system", 
          content: "You are an emotion analyzer. Analyze the user's text and return ONLY one of these labels: '积极 (Positive)', '消极 (Negative) - 悲伤', '消极 (Negative) - 愤怒', '消极 (Negative) - 焦虑', or '中性 (Neutral)'." 
        },
        { role: "user", content: text }
      ],
      temperature: 0,
      max_tokens: 15,
    });
    return response.choices[0]?.message?.content?.trim() || '未识别 (Neutral)';
  } catch(e) {
    console.error('Emotion recognition failed:', e);
    return '未识别 (Neutral)';
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for handling chat completion
  app.post('/api/chat', async (req, res) => {
    try {
      const { messages, userProfile, settings } = req.body;
      const provider = settings?.provider || 'openai';

      // 1. Get user profile from request
      let profileContext = "";
      if (userProfile && Object.values(userProfile).filter(Boolean).length > 0) {
        profileContext = `\n\n【用户个性化档案】
- 年龄：${userProfile.age || '未知'}
- 职业：${userProfile.occupation || '未知'}
- 长期情感状态/自评：${userProfile.emotional_state || '未知'}
- 辅导目标：${userProfile.counseling_goals || '未知'}
- 背景信息：${userProfile.background_info || '无'}
请在回应中自然地参考这些信息以提供更个性化的辅导。`;
      }

      // 2. Recognize emotion from the latest user message
      const latestUserMessage = messages.filter((m: any) => m.role === 'user').pop()?.content || '';
      let emotionLabel = '中性 (Neutral)';
      
      const systemMessage = {
        role: "system" as const,
        content: `你是一位专业、有同理心、经验丰富的心理咨询师。你的目标是提供心理支持、倾听用户的困扰、帮助他们进行情绪调节，并提供温和的建设性建议。
在与用户交流时，请遵循以下原则：
1. 始终保持专注、接纳和无条件积极关注。
2. 避免说教或替用户做直接决定，引导他们自我探索。
3. 语言需温和、体贴、真诚，使用鼓励性的语言。
4. 如果评估到用户可能存在严重的精神危机或有自残/自杀倾向，请务必建议他们寻求专业的现场医疗帮助或拨打危机援助热线。` + profileContext
      };

      let effectiveProvider = provider;
      const openaiApiKey = settings?.openaiApiKey || process.env.OPENAI_API_KEY;
      const geminiApiKey = settings?.geminiApiKey || process.env.GEMINI_API_KEY;

      // 如果选了 OpenAI 但是没有配 Key，且环境里有 Gemini Key，则自动降级到 Gemini
      if (effectiveProvider === 'openai' && !openaiApiKey && geminiApiKey) {
        effectiveProvider = 'gemini';
      }

      let replyContent = '';

      if (effectiveProvider === 'gemini') {
        const { GoogleGenAI } = await import('@google/genai');
        const apiKey = geminiApiKey;
        if (!apiKey) {
            return res.status(400).json({ error: 'GEMINI_API_KEY is not configured. Please set the API key in the settings.' });
        }
        const ai = new GoogleGenAI({ apiKey });
        
        if (latestUserMessage) {
           try {
              const res = await ai.models.generateContent({
                  model: 'gemini-2.5-flash',
                  contents: [
                      {role: 'user', parts: [{text: "You are an emotion analyzer. Analyze the user's text and return ONLY one of these labels: '积极 (Positive)', '消极 (Negative) - 悲伤', '消极 (Negative) - 愤怒', '消极 (Negative) - 焦虑', or '中性 (Neutral)'.\n\nUser text: " + latestUserMessage}]}
                  ],
                  config: { temperature: 0, maxOutputTokens: 15 }
              });
              emotionLabel = res.text?.trim() || emotionLabel;
           } catch(e) {
              console.error('Gemini emotion recognition failed:', e);
           }
        }
        
        const emotionContext = `\n\n【实时情绪识别】\n目前检测到用户这段话的情感状态为：${emotionLabel}。\n如果用户情绪低落（如悲伤、焦虑、压力大），请表现出更多的同情、耐心和理解；如果心情积极，可以更受鼓励并探讨进展，根据情绪动态调整回应语气。`;
        
        let genAiMessages = messages.map((m: any) => ({
           role: m.role === 'assistant' ? 'model' : 'user',
           parts: [{text: m.content}]
        }));
        
        try {
           const sysInstruction = systemMessage.content + emotionContext;
           const chatResponse = await ai.models.generateContent({
               model: 'gemini-2.5-pro',
               contents: genAiMessages,
               config: {
                   systemInstruction: sysInstruction,
                   temperature: 0.7,
                   maxOutputTokens: 1500
               }
           });
           replyContent = chatResponse.text || '';
        } catch(e: any) {
           throw new Error('Gemini API Error: ' + e.message);
        }

      } else {
        const apiKey = openaiApiKey;
        const baseURL = settings?.openaiBaseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
        const modelName = settings?.openaiModel || process.env.OPENAI_MODEL || 'gpt-3.5-turbo';

        if (!apiKey) {
           return res.status(400).json({ error: 'OPENAI_API_KEY is not configured. Please set the API key in the settings.' });
        }

        const openai = new OpenAI({
          apiKey: apiKey,
          baseURL: baseURL,
        });

        if (latestUserMessage) {
          emotionLabel = await recognizeEmotion(latestUserMessage, openai);
        }

        const emotionContext = `\n\n【实时情绪识别】\n目前检测到用户这段话的情感状态为：${emotionLabel}。\n如果用户情绪低落（如悲伤、焦虑、压力大），请表现出更多的同情、耐心和理解；如果心情积极，可以更受鼓励并探讨进展，根据情绪动态调整回应语气。`;
        systemMessage.content += emotionContext;

        const response = await openai.chat.completions.create({
          model: modelName,
          messages: [systemMessage, ...messages],
          temperature: 0.7,
          max_tokens: 1500,
        });

        replyContent = response.choices[0]?.message?.content || '';
      }

      res.json({ reply: replyContent, emotion: emotionLabel });
    } catch (error: any) {
      console.error('Error handling chat API:', error);
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
