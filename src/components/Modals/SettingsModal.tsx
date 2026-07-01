import React from 'react';
import { X, User } from 'lucide-react';
import { db, type AppSettings } from '../../db';
import { DataBackupPanel } from '../Settings/DataBackupPanel';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settingsForm: AppSettings;
  setSettingsForm: React.Dispatch<React.SetStateAction<AppSettings>>;
  activeSettingsTab: 'api' | 'ui' | 'data';
  setActiveSettingsTab: React.Dispatch<React.SetStateAction<'api' | 'ui' | 'data'>>;
  onDataRestored: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settingsForm,
  setSettingsForm,
  activeSettingsTab,
  setActiveSettingsTab,
  onDataRestored
}) => {
  if (!isOpen) return null;

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await db.settings.put({
        ...settingsForm,
        id: 1
      });
      onClose();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm fade-in">
      <div className="bg-[#F9F8F6] rounded-2xl w-full max-w-md overflow-hidden shadow-xl border border-[#E5E1D8] flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-[#E5E1D8] flex flex-col bg-white">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-serif italic font-semibold text-[#5A5A40] text-lg">系统设置</h3>
            <button onClick={onClose} className="text-[#8E8B82] hover:text-[#2D2926] p-1 rounded-md hover:bg-slate-100 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex gap-2 text-sm font-medium">
            <button
              onClick={() => setActiveSettingsTab('api')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${activeSettingsTab === 'api' ? 'bg-[#5A5A40] text-white' : 'text-[#8E8B82] hover:bg-[#F5F5F0]'}`}
            >
              API 配置
            </button>
            <button
              onClick={() => setActiveSettingsTab('ui')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${activeSettingsTab === 'ui' ? 'bg-[#5A5A40] text-white' : 'text-[#8E8B82] hover:bg-[#F5F5F0]'}`}
            >
              界面外观
            </button>
            <button
              onClick={() => setActiveSettingsTab('data')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${activeSettingsTab === 'data' ? 'bg-[#5A5A40] text-white' : 'text-[#8E8B82] hover:bg-[#F5F5F0]'}`}
            >
              数据管理
            </button>
          </div>
        </div>
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          <form id="settings-form" onSubmit={saveSettings} className="space-y-4">
            {activeSettingsTab === 'api' ? (
              <>
                <div>
                  <label className="block text-[11px] font-bold text-[#A6A298] uppercase tracking-tighter mb-1.5">模型供应商</label>
                  <select
                    value={settingsForm.provider}
                    onChange={(e) => setSettingsForm({ ...settingsForm, provider: e.target.value as any })}
                    className="w-full p-2.5 bg-white border border-[#E5E1D8] rounded-lg text-sm focus:outline-none focus:border-[#5A5A40] appearance-none"
                  >
                    <option value="openai">OpenAI (默认)</option>
                    <option value="gemini">Google Gemini SDK</option>
                  </select>
                </div>
                {settingsForm.provider === 'openai' && (
                  <>
                    <div>
                      <label className="block text-[11px] font-bold text-[#A6A298] uppercase tracking-tighter mb-1.5">OpenAI API Key</label>
                      <input type="password" value={settingsForm.openaiApiKey || ''} onChange={e => setSettingsForm({ ...settingsForm, openaiApiKey: e.target.value })} className="w-full p-2.5 bg-white border border-[#E5E1D8] rounded-lg text-sm focus:outline-none focus:border-[#5A5A40]" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[#A6A298] uppercase tracking-tighter mb-1.5">自定义 Base URL</label>
                      <input type="text" placeholder="https://api.openai.com/v1" value={settingsForm.openaiBaseUrl || ''} onChange={e => setSettingsForm({ ...settingsForm, openaiBaseUrl: e.target.value })} className="w-full p-2.5 bg-white border border-[#E5E1D8] rounded-lg text-sm focus:outline-none focus:border-[#5A5A40]" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[#A6A298] uppercase tracking-tighter mb-1.5">模型</label>
                      <input type="text" placeholder="gpt-3.5-turbo" value={settingsForm.openaiModel || ''} onChange={e => setSettingsForm({ ...settingsForm, openaiModel: e.target.value })} className="w-full p-2.5 bg-white border border-[#E5E1D8] rounded-lg text-sm focus:outline-none focus:border-[#5A5A40]" />
                    </div>
                  </>
                )}
                {settingsForm.provider === 'gemini' && (
                  <>
                    <div>
                      <label className="block text-[11px] font-bold text-[#A6A298] uppercase tracking-tighter mb-1.5">Gemini API Key</label>
                      <input type="password" value={settingsForm.geminiApiKey || ''} onChange={e => setSettingsForm({ ...settingsForm, geminiApiKey: e.target.value })} className="w-full p-2.5 bg-white border border-[#E5E1D8] rounded-lg text-sm focus:outline-none focus:border-[#5A5A40]" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[#A6A298] uppercase tracking-tighter mb-1.5">模型</label>
                      <input type="text" placeholder="gemini-3-flash-preview" value={settingsForm.geminiModel || ''} onChange={e => setSettingsForm({ ...settingsForm, geminiModel: e.target.value })} className="w-full p-2.5 bg-white border border-[#E5E1D8] rounded-lg text-sm focus:outline-none focus:border-[#5A5A40]" />
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-[11px] font-bold text-[#A6A298] uppercase tracking-tighter mb-1.5">
                    最大上下文长度 (Tokens)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="256000"
                      value={settingsForm.maxContextWindow || 256000}
                      onChange={e => setSettingsForm({ ...settingsForm, maxContextWindow: parseInt(e.target.value) || 256000 })}
                      className="flex-1 p-2.5 bg-white border border-[#E5E1D8] rounded-lg text-sm focus:outline-none focus:border-[#5A5A40]"
                    />
                    <div className="flex items-center px-3 bg-[#F5F5F0] border border-[#E5E1D8] rounded-lg text-xs text-[#8E8B82] font-medium">
                      Tokens
                    </div>
                  </div>
                  <p className="mt-1 text-[10px] text-[#A6A298]">上下文接近 80% 时将自动触发压缩总结。</p>
                </div>
              </>
            ) : activeSettingsTab === 'ui' ? (
              <>
                <div className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold text-[#A6A298] uppercase tracking-tighter mb-2">用户头像 (上传并保存)</label>
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-2xl bg-[#D9D4C7] flex-shrink-0 flex items-center justify-center overflow-hidden border border-[#E5E1D8]">
                        {settingsForm.userAvatar ? (
                          <img src={settingsForm.userAvatar} className="w-full h-full object-cover" alt="User avatar preview" />
                        ) : (
                          <User className="w-8 h-8 text-[#5A5A40]" />
                        )}
                      </div>
                      <div className="flex-1 flex flex-col gap-2">
                        <label className="cursor-pointer">
                          <div className="px-4 py-2.5 bg-white border border-[#E5E1D8] rounded-xl text-sm font-medium text-[#5A5A40] text-center hover:bg-[#F5F5F0] transition-colors">
                            点击上传新头像
                          </div>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = (ev) => setSettingsForm({ ...settingsForm, userAvatar: ev.target?.result as string });
                                reader.readAsDataURL(file);
                              }
                            }}
                          />
                        </label>
                        {settingsForm.userAvatar && (
                          <button
                            type="button"
                            onClick={() => setSettingsForm({ ...settingsForm, userAvatar: undefined })}
                            className="text-[10px] text-[#A6A298] hover:text-[#5A5A40] transition-colors text-center"
                          >
                            恢复默认头像
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#A6A298] uppercase tracking-tighter mb-2">AI 助手头像 (上传并保存)</label>
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-2xl bg-[#5A5A40] flex-shrink-0 flex items-center justify-center overflow-hidden border border-[#E5E1D8]">
                        {settingsForm.assistantAvatar ? (
                          <img src={settingsForm.assistantAvatar} className="w-full h-full object-cover" alt="AI avatar preview" />
                        ) : (
                          <span className="text-white font-serif italic text-2xl">心</span>
                        )}
                      </div>
                      <div className="flex-1 flex flex-col gap-2">
                        <label className="cursor-pointer">
                          <div className="px-4 py-2.5 bg-white border border-[#E5E1D8] rounded-xl text-sm font-medium text-[#5A5A40] text-center hover:bg-[#F5F5F0] transition-colors">
                            点击上传新头像
                          </div>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = (ev) => setSettingsForm({ ...settingsForm, assistantAvatar: ev.target?.result as string });
                                reader.readAsDataURL(file);
                              }
                            }}
                          />
                        </label>
                        {settingsForm.assistantAvatar && (
                          <button
                            type="button"
                            onClick={() => setSettingsForm({ ...settingsForm, assistantAvatar: undefined })}
                            className="text-[10px] text-[#A6A298] hover:text-[#5A5A40] transition-colors text-center"
                          >
                            恢复默认头像
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#E5E1D8] mt-4">
                  <label className="block text-[11px] font-bold text-[#A6A298] uppercase tracking-tighter mb-2">聊天背景模式</label>
                  <select
                    value={settingsForm.chatBackgroundMode}
                    onChange={(e) => setSettingsForm({ ...settingsForm, chatBackgroundMode: e.target.value as any })}
                    className="w-full p-3 bg-white border border-[#E5E1D8] rounded-xl text-sm focus:outline-none focus:border-[#5A5A40] appearance-none mb-4"
                  >
                    <option value="default">默认白底</option>
                    <option value="color">纯色背景</option>
                    <option value="image">图片背景</option>
                  </select>

                  {settingsForm.chatBackgroundMode === 'color' && (
                    <div className="fade-in">
                      <label className="block text-[11px] font-bold text-[#A6A298] uppercase tracking-tighter mb-2">选择背景颜色</label>
                      <div className="flex gap-2">
                        <input type="color" value={settingsForm.chatBackgroundColor || '#ffffff'} onChange={e => setSettingsForm({ ...settingsForm, chatBackgroundColor: e.target.value })} className="w-12 h-12 p-1 bg-white border border-[#E5E1D8] rounded-xl cursor-pointer" />
                        <input type="text" value={settingsForm.chatBackgroundColor} onChange={e => setSettingsForm({ ...settingsForm, chatBackgroundColor: e.target.value })} className="flex-1 p-2.5 bg-white border border-[#E5E1D8] rounded-xl text-sm focus:outline-none focus:border-[#5A5A40]" />
                      </div>
                    </div>
                  )}

                  {settingsForm.chatBackgroundMode === 'image' && (
                    <div className="fade-in">
                      <label className="block text-[11px] font-bold text-[#A6A298] uppercase tracking-tighter mb-2">背景图片 (上传并保存)</label>
                      <div className="space-y-3">
                        {settingsForm.chatBackgroundImage && (
                          <div className="w-full h-32 rounded-xl bg-slate-100 overflow-hidden border border-[#E5E1D8]">
                            <img src={settingsForm.chatBackgroundImage} className="w-full h-full object-cover" alt="Background preview" />
                          </div>
                        )}
                          <div className="flex flex-col gap-2">
                            <label className="block cursor-pointer">
                              <div className="px-4 py-3 bg-white border border-[#E5E1D8] rounded-xl text-sm font-medium text-[#5A5A40] text-center hover:bg-[#F5F5F0] transition-colors">
                                {settingsForm.chatBackgroundImage ? '更换背景图片' : '上传背景图片'}
                              </div>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onload = (ev) => setSettingsForm({ ...settingsForm, chatBackgroundImage: ev.target?.result as string });
                                    reader.readAsDataURL(file);
                                  }
                                }}
                              />
                            </label>
                            {settingsForm.chatBackgroundImage && (
                              <button
                                type="button"
                                onClick={() => setSettingsForm({ ...settingsForm, chatBackgroundImage: undefined })}
                                className="text-[10px] text-[#A6A298] hover:text-[#5A5A40] transition-colors text-center"
                              >
                                恢复默认背景
                              </button>
                            )}
                          </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <DataBackupPanel onImportComplete={onDataRestored} />
            )}
          </form>
        </div>
        <div className="p-5 bg-white border-t border-[#E5E1D8] flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-5 py-2 text-[#5A5A40] hover:bg-[#F5F5F0] rounded-xl text-sm font-medium transition-colors">
            {activeSettingsTab === 'data' ? '关闭' : '取消'}
          </button>
          {activeSettingsTab !== 'data' && (
            <button type="submit" form="settings-form" className="px-5 py-2 bg-[#5A5A40] text-white rounded-xl text-sm font-medium hover:bg-[#4A4A35] transition-colors">
              保存设置
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
