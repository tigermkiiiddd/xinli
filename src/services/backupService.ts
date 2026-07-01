import {
  db,
  DB_SCHEMA_VERSION,
  type AppSettings,
  type Chat,
  type MemoryEntry,
  type Message,
  type UserProfile,
} from '../db';

export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_APP_ID = 'xinli';

export interface BackupMeta {
  chatCount: number;
  memoryCount: number;
  messageCount: number;
  hasUserProfile: boolean;
  hasSettings: boolean;
}

export interface MindCareBackupV1 {
  formatVersion: 1;
  dbSchemaVersion: number;
  appId: typeof BACKUP_APP_ID;
  exportedAt: string;
  meta: BackupMeta;
  data: {
    userProfile: UserProfile | null;
    settings: AppSettings | null;
    chats: Chat[];
    memories: MemoryEntry[];
  };
}

export type MindCareBackup = MindCareBackupV1;

export class BackupError extends Error {
  constructor(
    public code: 'INVALID_JSON' | 'INVALID_STRUCTURE' | 'UNSUPPORTED_VERSION' | 'IMPORT_FAILED',
    message: string
  ) {
    super(message);
    this.name = 'BackupError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateTokenUsage(value: unknown): Message['usage'] | undefined {
  if (!isRecord(value)) return undefined;
  if (!isNumber(value.promptTokens) || !isNumber(value.completionTokens) || !isNumber(value.totalTokens)) {
    return undefined;
  }
  return {
    promptTokens: value.promptTokens,
    completionTokens: value.completionTokens,
    totalTokens: value.totalTokens,
  };
}

function validateMessage(value: unknown): Message {
  if (!isRecord(value) || !isString(value.id) || !isString(value.content) || !isNumber(value.createdAt)) {
    throw new BackupError('INVALID_STRUCTURE', '备份中的消息数据格式无效');
  }
  if (value.role !== 'user' && value.role !== 'assistant' && value.role !== 'system') {
    throw new BackupError('INVALID_STRUCTURE', '备份中的消息角色无效');
  }
  return {
    id: value.id,
    role: value.role,
    content: value.content,
    createdAt: value.createdAt,
    emotion: isString(value.emotion) ? value.emotion : undefined,
    usage: validateTokenUsage(value.usage),
    isSummary: typeof value.isSummary === 'boolean' ? value.isSummary : undefined,
  };
}

function validateChat(value: unknown): Chat {
  if (!isRecord(value) || !isString(value.id) || !isString(value.title) || !isNumber(value.updatedAt)) {
    throw new BackupError('INVALID_STRUCTURE', '备份中的对话数据格式无效');
  }
  if (!Array.isArray(value.messages)) {
    throw new BackupError('INVALID_STRUCTURE', '备份中的对话缺少消息列表');
  }
  return {
    id: value.id,
    title: value.title,
    updatedAt: value.updatedAt,
    isArchived: typeof value.isArchived === 'boolean' ? value.isArchived : undefined,
    messages: value.messages.map(validateMessage),
  };
}

function validateMemory(value: unknown): MemoryEntry {
  if (
    !isRecord(value) ||
    !isString(value.id) ||
    !isString(value.content) ||
    !isString(value.prerequisite) ||
    !isString(value.domain) ||
    !isNumber(value.updatedAt)
  ) {
    throw new BackupError('INVALID_STRUCTURE', '备份中的记忆数据格式无效');
  }
  if (!Array.isArray(value.connections)) {
    throw new BackupError('INVALID_STRUCTURE', '备份中的记忆缺少关联信息');
  }
  const validCategories = ['Trauma', 'Growth', 'Relationship', 'Habit', 'Personality', 'Crisis', 'Resource', 'Other'] as const;
  if (!isString(value.category) || !validCategories.includes(value.category as (typeof validCategories)[number])) {
    throw new BackupError('INVALID_STRUCTURE', '备份中的记忆类别无效');
  }

  return {
    id: value.id,
    category: value.category as MemoryEntry['category'],
    content: value.content,
    prerequisite: value.prerequisite,
    domain: value.domain,
    updatedAt: value.updatedAt,
    connections: value.connections as MemoryEntry['connections'],
  };
}

function validateUserProfile(value: unknown): UserProfile {
  if (!isRecord(value)) {
    throw new BackupError('INVALID_STRUCTURE', '备份中的个人资料格式无效');
  }
  return { ...value, id: 1 } as UserProfile;
}

function validateSettings(value: unknown): AppSettings {
  if (!isRecord(value)) {
    throw new BackupError('INVALID_STRUCTURE', '备份中的系统设置格式无效');
  }
  if (value.provider !== 'openai' && value.provider !== 'gemini') {
    throw new BackupError('INVALID_STRUCTURE', '备份中的模型供应商无效');
  }
  return { ...value, id: 1 } as AppSettings;
}

function buildMeta(data: MindCareBackupV1['data']): BackupMeta {
  const messageCount = data.chats.reduce((sum, chat) => sum + chat.messages.length, 0);
  return {
    chatCount: data.chats.length,
    memoryCount: data.memories.length,
    messageCount,
    hasUserProfile: data.userProfile !== null,
    hasSettings: data.settings !== null,
  };
}

function normalizeV1(raw: Record<string, unknown>): MindCareBackupV1 {
  const dataNode = isRecord(raw.data) ? raw.data : raw;
  const chatsRaw = Array.isArray(dataNode.chats) ? dataNode.chats : [];
  const memoriesRaw = Array.isArray(dataNode.memories) ? dataNode.memories : [];

  const data: MindCareBackupV1['data'] = {
    userProfile: dataNode.userProfile ? validateUserProfile(dataNode.userProfile) : null,
    settings: dataNode.settings ? validateSettings(dataNode.settings) : null,
    chats: chatsRaw.map(validateChat),
    memories: memoriesRaw.map(validateMemory),
  };

  const formatVersion = raw.formatVersion ?? raw.version;
  if (formatVersion !== undefined && formatVersion !== 1) {
    throw new BackupError('UNSUPPORTED_VERSION', `不支持的备份格式版本: v${formatVersion}`);
  }

  const dbSchemaVersion = isNumber(raw.dbSchemaVersion) ? raw.dbSchemaVersion : DB_SCHEMA_VERSION;
  if (dbSchemaVersion > DB_SCHEMA_VERSION) {
    throw new BackupError(
      'UNSUPPORTED_VERSION',
      `备份来自更高版本数据库 (v${dbSchemaVersion})，请更新应用后再导入`
    );
  }

  const appId = raw.appId;
  if (appId !== undefined && appId !== BACKUP_APP_ID) {
    throw new BackupError('INVALID_STRUCTURE', '这不是心语应用的备份文件');
  }

  const exportedAt = isString(raw.exportedAt) ? raw.exportedAt : new Date().toISOString();

  return {
    formatVersion: 1,
    dbSchemaVersion,
    appId: BACKUP_APP_ID,
    exportedAt,
    meta: buildMeta(data),
    data,
  };
}

export function migrateBackup(raw: unknown): MindCareBackupV1 {
  if (!isRecord(raw)) {
    throw new BackupError('INVALID_JSON', '无效的备份文件');
  }

  const formatVersion = raw.formatVersion ?? raw.version ?? 1;
  if (typeof formatVersion === 'number' && formatVersion > BACKUP_FORMAT_VERSION) {
    throw new BackupError('UNSUPPORTED_VERSION', `备份版本 v${formatVersion} 过高，请更新应用`);
  }

  return normalizeV1(raw);
}

export async function exportBackup(): Promise<MindCareBackupV1> {
  const [userProfile, settings, chats, memories] = await Promise.all([
    db.userProfile.get(1),
    db.settings.get(1),
    db.chats.toArray(),
    db.memories.toArray(),
  ]);

  const data: MindCareBackupV1['data'] = {
    userProfile: userProfile ?? null,
    settings: settings ?? null,
    chats,
    memories,
  };

  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    dbSchemaVersion: DB_SCHEMA_VERSION,
    appId: BACKUP_APP_ID,
    exportedAt: new Date().toISOString(),
    meta: buildMeta(data),
    data,
  };
}

export function downloadBackup(backup: MindCareBackupV1): void {
  const timestamp = backup.exportedAt.replace(/[:.]/g, '-');
  const filename = `xinli-backup-v${backup.formatVersion}-${timestamp}.json`;
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function exportAndDownloadBackup(): Promise<MindCareBackupV1> {
  const backup = await exportBackup();
  downloadBackup(backup);
  return backup;
}

export async function importBackup(backup: MindCareBackupV1): Promise<void> {
  const normalized = migrateBackup(backup);

  try {
    await db.transaction('rw', db.userProfile, db.settings, db.chats, db.memories, async () => {
      await Promise.all([
        db.userProfile.clear(),
        db.settings.clear(),
        db.chats.clear(),
        db.memories.clear(),
      ]);

      if (normalized.data.userProfile) {
        await db.userProfile.put({ ...normalized.data.userProfile, id: 1 });
      }

      if (normalized.data.settings) {
        await db.settings.put({ ...normalized.data.settings, id: 1 });
      }

      if (normalized.data.chats.length > 0) {
        await db.chats.bulkPut(normalized.data.chats);
      }

      if (normalized.data.memories.length > 0) {
        await db.memories.bulkPut(normalized.data.memories);
      }
    });
  } catch (error) {
    console.error(error);
    throw new BackupError('IMPORT_FAILED', '导入失败，请确认备份文件完整后重试');
  }
}

export async function parseBackupFile(file: File): Promise<MindCareBackupV1> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupError('INVALID_JSON', '无法解析 JSON 文件');
  }
  return migrateBackup(parsed);
}

export function formatBackupSummary(meta: BackupMeta): string {
  return `${meta.chatCount} 个对话 · ${meta.messageCount} 条消息 · ${meta.memoryCount} 条记忆`;
}
