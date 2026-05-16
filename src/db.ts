import Dexie, { type Table } from 'dexie';

export interface UserProfile {
  id: number; // Always 1
  age?: number | '';
  occupation?: string;
  emotional_state?: string;
  counseling_goals?: string;
  background_info?: string;
}

export interface ProviderSettings {
  id: number; // Always 1
  provider: 'openai' | 'gemini';
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  openaiModel?: string;
  geminiApiKey?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  emotion?: string;
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
}

export class MindCareDB extends Dexie {
  userProfile!: Table<UserProfile, number>;
  chats!: Table<Chat, string>;
  settings!: Table<ProviderSettings, number>;

  constructor() {
    super('MindCareDB');
    this.version(2).stores({
      userProfile: 'id',
      chats: 'id, updatedAt',
      settings: 'id'
    });
  }
}

export const db = new MindCareDB();
