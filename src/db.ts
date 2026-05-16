import Dexie, { type Table } from 'dexie';

export interface UserProfile {
  id: number; // Always 1
  nickname?: string;
  age?: number | '';
  occupation?: string;
  emotional_state?: string;
  counseling_goals?: string;
  background_info?: string;
}

export interface AppSettings {
  id: number; // Always 1
  provider: 'openai' | 'gemini';
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  openaiModel?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  userAvatar?: string;
  assistantAvatar?: string;
  assistantName?: string;
  assistantPersonality?: string;
  chatBackgroundMode?: 'default' | 'color' | 'image';
  chatBackgroundColor?: string;
  chatBackgroundImage?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  emotion?: string;
}

export interface MemoryConnection {
  targetId: string;
  type: 'related' | 'conflicting' | 'cause' | 'effect';
}

export interface MemoryEntry {
  id: string;
  category: 'Trauma' | 'Growth' | 'Relationship' | 'Habit' | 'Personality' | 'Crisis' | 'Resource' | 'Other';
  content: string;
  prerequisite: string; // 成立前提
  domain: string; // 作用领域
  updatedAt: number;
  connections: MemoryConnection[];
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
  isArchived?: boolean;
}

export class MindCareDB extends Dexie {
  userProfile!: Table<UserProfile, number>;
  chats!: Table<Chat, string>;
  settings!: Table<AppSettings, number>;
  memories!: Table<MemoryEntry, string>;

  constructor() {
    super('MindCareDB');
    this.version(4).stores({
      userProfile: 'id',
      chats: 'id, updatedAt, isArchived',
      settings: 'id',
      memories: 'id, category, updatedAt'
    });
  }
}

export const db = new MindCareDB();
