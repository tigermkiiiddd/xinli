import React from 'react';
import { X, Edit2, Sparkles, Brain } from 'lucide-react';
import { db, type AppSettings } from '../../db';

interface MentorModalProps {
  isOpen: boolean;
  onClose: () => void;
  settingsForm: AppSettings;
  setSettingsForm: React.Dispatch<React.SetStateAction<AppSettings>>;
}

export const MentorModal: React.FC<MentorModalProps> = ({
  isOpen,
  onClose,
  settingsForm,
  setSettingsForm,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm fade-in">
      <div className="bg-[#F9F8F6] rounded-2xl w-full max-w-md overflow-hidden shadow-xl border border-[#E5E1D8] flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-[#E5E1D8] flex justify-between items-center bg-white">
          <h3 className="font-serif italic font-semibold text-[#5A5A40] text-lg">心理导师设定</h3>
          <button onClick={onClose} className="text-[#8E8B82] hover:text-[#2D2926] p-1 rounded-md hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          <div className="space-y-6">
            <div className="flex flex-col items-center gap-4 py-2">
              <div className="relative group">
                <div className="w-24 h-24 rounded-3xl bg-[#5A5A40] flex items-center justify-center overflow-hidden border-2 border-[#E5E1D8] shadow-md transition-all group-hover:border-[#5A5A40]">
                  {settingsForm.assistantAvatar ? (
                    <img src={settingsForm.assistantAvatar} className="w-full h-full object-cover" alt="Mentor avatar preview" />
                  ) : (
                    <span className="text-white font-serif italic text-4xl">{settingsForm.assistantName?.charAt(0) || '心'}</span>
                  )}
                </div>
                <div className="absolute -bottom-2 -right-2 flex flex-col items-center gap-1">
                  <label className="bg-white p-2 rounded-full shadow-lg border border-[#E5E1D8] cursor-pointer hover:bg-[#F5F5F0] transition-colors" title="更改头像">
                    <Edit2 className="w-4 h-4 text-[#5A5A40]" />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            const newAvatar = ev.target?.result as string;
                            setSettingsForm({ ...settingsForm, assistantAvatar: newAvatar });
                            db.settings.update(1, { assistantAvatar: newAvatar });
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                  {settingsForm.assistantAvatar && (
                    <button
                      type="button"
                      onClick={() => {
                        setSettingsForm({ ...settingsForm, assistantAvatar: undefined });
                        db.settings.update(1, { assistantAvatar: undefined });
                      }}
                      className="bg-white p-1 rounded-full shadow-md border border-[#E5E1D8] text-[8px] text-[#A6A298] hover:text-[#5A5A40] hover:bg-[#F5F5F0] transition-colors"
                      title="恢复默认"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-[#A6A298] uppercase tracking-widest font-bold">点击图标更换导师头像</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-[#A6A298] uppercase tracking-tighter mb-1.5">导师称呼 (你可以为我起个名字)</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="如：心心、王导师"
                    value={settingsForm.assistantName}
                    onChange={e => {
                      const newName = e.target.value;
                      setSettingsForm({ ...settingsForm, assistantName: newName });
                    }}
                    onBlur={async () => {
                      await db.settings.update(1, { assistantName: settingsForm.assistantName });
                    }}
                    className="w-full p-3 bg-white border border-[#E5E1D8] rounded-xl text-sm focus:outline-none focus:border-[#5A5A40] pr-10"
                  />
                  <Sparkles className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5A5A40]/40" />
                </div>
              </div>

              <div className="bg-[#F5F5F0] p-4 rounded-xl border border-[#E5E1D8]">
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="w-4 h-4 text-[#5A5A40]" />
                  <span className="text-xs font-bold text-[#5A5A40]">导师性格说明</span>
                </div>
                <textarea
                  value={settingsForm.assistantPersonality || ''}
                  onChange={e => {
                    setSettingsForm({ ...settingsForm, assistantPersonality: e.target.value });
                  }}
                  onBlur={async () => {
                    await db.settings.update(1, { assistantPersonality: settingsForm.assistantPersonality });
                  }}
                  placeholder="描述导师的性格风格、咨询流派或语言风格..."
                  className="w-full h-24 p-2 bg-white border border-[#E5E1D8] rounded-lg text-xs leading-relaxed focus:outline-none focus:border-[#5A5A40] resize-none"
                />
                <p className="text-[10px] text-[#A6A298] mt-2 italic">
                  提示：你也可以通过对话直接要求我调整性格。
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="p-5 bg-white border-t border-[#E5E1D8] flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-[#5A5A40] text-white rounded-xl text-sm font-medium hover:bg-[#4A4A35] transition-colors shadow-sm"
          >
            完成设定
          </button>
        </div>
      </div>
    </div>
  );
};
