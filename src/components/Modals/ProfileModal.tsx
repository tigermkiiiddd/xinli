import React from 'react';
import { X } from 'lucide-react';
import { db, type UserProfile } from '../../db';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profileForm: {
    nickname: string;
    age: string;
    occupation: string;
    emotional_state: string;
    counseling_goals: string;
    background_info: string;
  };
  setProfileForm: React.Dispatch<React.SetStateAction<{
    nickname: string;
    age: string;
    occupation: string;
    emotional_state: string;
    counseling_goals: string;
    background_info: string;
  }>>;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  profileForm,
  setProfileForm
}) => {
  if (!isOpen) return null;

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await db.userProfile.put({
        id: 1,
        ...profileForm,
        age: profileForm.age ? parseInt(profileForm.age) : ''
      });
      onClose();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm fade-in">
      <div className="bg-[#F9F8F6] rounded-2xl w-full max-w-md overflow-hidden shadow-xl border border-[#E5E1D8] flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-[#E5E1D8] flex justify-between items-center bg-white">
          <h3 className="font-serif italic font-semibold text-[#5A5A40] text-lg">个人档案设置</h3>
          <button onClick={onClose} className="text-[#8E8B82] hover:text-[#2D2926] p-1 rounded-md hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          <form id="profile-form" onSubmit={saveProfile} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-[#A6A298] uppercase tracking-tighter mb-1.5">称呼 (怎么称呼你)</label>
              <input type="text" placeholder="如：小张、王先生" value={profileForm.nickname} onChange={e => setProfileForm({ ...profileForm, nickname: e.target.value })} className="w-full p-2.5 bg-white border border-[#E5E1D8] rounded-lg text-sm focus:outline-none focus:border-[#5A5A40]" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[#A6A298] uppercase tracking-tighter mb-1.5">年龄</label>
              <input type="number" value={profileForm.age} onChange={e => setProfileForm({ ...profileForm, age: e.target.value })} className="w-full p-2.5 bg-white border border-[#E5E1D8] rounded-lg text-sm focus:outline-none focus:border-[#5A5A40]" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[#A6A298] uppercase tracking-tighter mb-1.5">职业</label>
              <input type="text" value={profileForm.occupation} onChange={e => setProfileForm({ ...profileForm, occupation: e.target.value })} className="w-full p-2.5 bg-white border border-[#E5E1D8] rounded-lg text-sm focus:outline-none focus:border-[#5A5A40]" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[#A6A298] uppercase tracking-tighter mb-1.5">长期情感状态/自评</label>
              <input type="text" placeholder="如：容易焦虑、疲惫" value={profileForm.emotional_state} onChange={e => setProfileForm({ ...profileForm, emotional_state: e.target.value })} className="w-full p-2.5 bg-white border border-[#E5E1D8] rounded-lg text-sm focus:outline-none focus:border-[#5A5A40]" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[#A6A298] uppercase tracking-tighter mb-1.5">辅导目标</label>
              <input type="text" placeholder="如：学会缓解压力" value={profileForm.counseling_goals} onChange={e => setProfileForm({ ...profileForm, counseling_goals: e.target.value })} className="w-full p-2.5 bg-white border border-[#E5E1D8] rounded-lg text-sm focus:outline-none focus:border-[#5A5A40]" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[#A6A298] uppercase tracking-tighter mb-1.5">背景信息 (让AI更了解你)</label>
              <textarea rows={3} placeholder="任何你希望AI参考的背景信息..." value={profileForm.background_info} onChange={e => setProfileForm({ ...profileForm, background_info: e.target.value })} className="w-full p-2.5 bg-white border border-[#E5E1D8] rounded-lg text-sm focus:outline-none focus:border-[#5A5A40] resize-none" />
            </div>
          </form>
        </div>
        <div className="p-5 bg-white border-t border-[#E5E1D8] flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-5 py-2 text-[#5A5A40] hover:bg-[#F5F5F0] rounded-xl text-sm font-medium transition-colors">
            取消
          </button>
          <button type="submit" form="profile-form" className="px-5 py-2 bg-[#5A5A40] text-white rounded-xl text-sm font-medium hover:bg-[#4A4A35] transition-colors">
            保存档案
          </button>
        </div>
      </div>
    </div>
  );
};
