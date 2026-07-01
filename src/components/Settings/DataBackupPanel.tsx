import React, { useRef, useState } from 'react';
import { Download, Upload, AlertTriangle, Database, FileJson } from 'lucide-react';
import {
  BACKUP_FORMAT_VERSION,
  BackupError,
  exportAndDownloadBackup,
  formatBackupSummary,
  importBackup,
  parseBackupFile,
  type MindCareBackupV1,
} from '../../services/backupService';
import { DB_SCHEMA_VERSION } from '../../db';

interface DataBackupPanelProps {
  onImportComplete: () => void;
}

export const DataBackupPanel: React.FC<DataBackupPanelProps> = ({ onImportComplete }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<'success' | 'error' | 'info'>('info');
  const [pendingBackup, setPendingBackup] = useState<MindCareBackupV1 | null>(null);

  const setStatus = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setStatusMessage(message);
    setStatusType(type);
  };

  const handleExport = async () => {
    setIsExporting(true);
    setStatusMessage(null);
    try {
      const backup = await exportAndDownloadBackup();
      setStatus(`已导出完整备份（${formatBackupSummary(backup.meta)}）`, 'success');
    } catch (error) {
      console.error(error);
      setStatus('导出失败，请稍后重试', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setIsImporting(true);
    setStatusMessage(null);
    setPendingBackup(null);

    try {
      const backup = await parseBackupFile(file);
      setPendingBackup(backup);
      setStatus(
        `已读取备份文件（格式 v${backup.formatVersion}，${formatBackupSummary(backup.meta)}）。确认后将覆盖当前全部本地数据。`,
        'info'
      );
    } catch (error) {
      const message = error instanceof BackupError ? error.message : '导入文件解析失败';
      setStatus(message, 'error');
    } finally {
      setIsImporting(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!pendingBackup) return;

    setIsImporting(true);
    try {
      await importBackup(pendingBackup);
      setPendingBackup(null);
      setStatus(`导入成功（${formatBackupSummary(pendingBackup.meta)}）`, 'success');
      onImportComplete();
    } catch (error) {
      const message = error instanceof BackupError ? error.message : '导入失败，请稍后重试';
      setStatus(message, 'error');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[#E5E1D8] bg-white p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#F5F5F0] flex items-center justify-center flex-shrink-0">
            <FileJson className="w-5 h-5 text-[#5A5A40]" />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-[#2D2926]">完整数据备份</h4>
            <p className="mt-1 text-xs text-[#8E8B82] leading-relaxed">
              导出包含个人资料、系统设置、全部对话与长期记忆的 JSON 文件。备份格式版本 v{BACKUP_FORMAT_VERSION}，数据库结构版本 v{DB_SCHEMA_VERSION}。
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <button
          type="button"
          onClick={handleExport}
          disabled={isExporting}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#5A5A40] text-white rounded-xl text-sm font-medium hover:bg-[#4A4A35] transition-colors disabled:opacity-60"
        >
          <Download className="w-4 h-4" />
          {isExporting ? '正在导出...' : '导出完整备份'}
        </button>

        <label className="block cursor-pointer">
          <div className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white border border-[#E5E1D8] text-[#5A5A40] rounded-xl text-sm font-medium hover:bg-[#F5F5F0] transition-colors">
            <Upload className="w-4 h-4" />
            {isImporting ? '正在处理...' : '选择备份文件导入'}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleFileSelect}
            disabled={isImporting}
          />
        </label>
      </div>

      {pendingBackup && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
          <div className="flex items-start gap-2 text-amber-800">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div className="text-xs leading-relaxed">
              <p className="font-semibold">确认导入将覆盖当前全部本地数据</p>
              <p className="mt-1">
                {formatBackupSummary(pendingBackup.meta)} · 导出时间 {new Date(pendingBackup.exportedAt).toLocaleString()}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPendingBackup(null)}
              className="flex-1 px-3 py-2 text-xs text-[#5A5A40] bg-white border border-[#E5E1D8] rounded-lg hover:bg-[#F5F5F0] transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={isImporting}
              className="flex-1 px-3 py-2 text-xs text-white bg-amber-700 rounded-lg hover:bg-amber-800 transition-colors disabled:opacity-60"
            >
              确认覆盖导入
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-dashed border-[#E5E1D8] bg-[#FAFAF8] p-4">
        <div className="flex items-center gap-2 text-[#5A5A40] text-xs font-semibold mb-2">
          <Database className="w-3.5 h-3.5" />
          备份内容说明
        </div>
        <ul className="text-[11px] text-[#8E8B82] space-y-1.5 leading-relaxed">
          <li>个人档案：称呼、背景、辅导目标等</li>
          <li>系统设置：API 配置、头像、聊天背景等</li>
          <li>对话记录：全部消息与上下文压缩摘要</li>
          <li>长期记忆：记忆条目及关联关系</li>
          <li>备份文件含 API Key 等敏感信息，请妥善保管</li>
        </ul>
      </div>

      {statusMessage && (
        <div
          className={`rounded-xl px-4 py-3 text-xs leading-relaxed ${
            statusType === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : statusType === 'error'
                ? 'bg-red-50 text-red-800 border border-red-200'
                : 'bg-[#F5F5F0] text-[#5A5A40] border border-[#E5E1D8]'
          }`}
        >
          {statusMessage}
        </div>
      )}
    </div>
  );
};
