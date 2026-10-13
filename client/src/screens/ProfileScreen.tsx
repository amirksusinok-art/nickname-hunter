import React, { useState } from 'react';
import { User, Shield, Zap, Sparkles, Coins, Trophy, Eye, EyeOff, Layers } from 'lucide-react';
import { UserProfile, UserStats, api } from '../api/client.js';
import { PlainTextNickname } from '../components/PlainTextNickname.js';
import { RarityBadge } from '../components/RarityBadge.js';
import { haptic, getTelegramUser } from '../telegram/telegram-sdk.js';

interface ProfileScreenProps {
  user: UserProfile;
  stats: UserStats;
  reducedMotion: boolean;
  onToggleReducedMotion: () => void;
  onPrivacyToggle: (newValue: boolean) => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  user,
  stats,
  reducedMotion,
  onToggleReducedMotion,
  onPrivacyToggle,
}) => {
  const [updatingPrivacy, setUpdatingPrivacy] = useState(false);
  const tgUser = getTelegramUser();

  const handleTogglePrivacy = async () => {
    if (updatingPrivacy) return;
    setUpdatingPrivacy(true);
    haptic.selection();

    const newVal = !user.privacy_hide_balance;
    try {
      await api.updateSettings({ privacy_hide_balance: newVal });
      onPrivacyToggle(newVal);
    } catch (err: any) {
      console.error(err);
    } finally {
      setUpdatingPrivacy(false);
    }
  };

  const xpNeeded = user.level * 100;
  const xpPercent = Math.min(100, Math.round((user.xp / xpNeeded) * 100));

  return (
    <div className="flex flex-col min-h-[calc(100vh-120px)] px-4 pb-24 pt-4 max-w-md mx-auto w-full">
      {/* User Card */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-5 mb-4 backdrop-blur-sm flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-600 to-blue-400 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-sky-500/20">
            {(user.username || 'H').slice(0, 1).toUpperCase()}
          </div>
          <div className="flex flex-col">
            <h2 className="text-base font-black text-slate-100">
              {user.username || tgUser?.username || 'Охотник'}
            </h2>
            <div className="text-xs text-slate-400 font-mono">
              ID: {user.telegram_id}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[10px] bg-sky-500/20 text-sky-300 font-bold px-2 py-0.5 rounded-full">
                УРОВЕНЬ {user.level}
              </span>
            </div>
          </div>
        </div>

        {/* Level XP Progress */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-xs text-slate-400 font-medium">
            <span>Опыт охотника</span>
            <span>
              {user.xp} / {xpNeeded} XP
            </span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-sky-500 to-blue-500 h-full transition-all duration-300"
              style={{ width: `${xpPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-3.5 flex flex-col">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
            <Coins className="w-4 h-4 text-amber-400" />
            <span>Баланс</span>
          </div>
          <div className="font-mono font-black text-slate-100 text-lg">
            {user.balance_ud} UD
          </div>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-3.5 flex flex-col">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
            <Layers className="w-4 h-4 text-sky-400" />
            <span>Всего смен</span>
          </div>
          <div className="font-mono font-black text-slate-100 text-lg">
            {stats.total_drops}
          </div>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-3.5 flex flex-col">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
            <Zap className="w-4 h-4 text-purple-400" />
            <span>Счетчик Pity</span>
          </div>
          <div className="font-mono font-black text-slate-100 text-lg">
            {stats.pity_counter}/100
          </div>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-3.5 flex flex-col">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
            <Trophy className="w-4 h-4 text-rose-400" />
            <span>Лучший Score</span>
          </div>
          <div className="font-mono font-black text-slate-100 text-lg">
            {stats.best_score || 0}
          </div>
        </div>
      </div>

      {/* Best Drop Showcase */}
      {stats.best_nickname && (
        <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-4 mb-4 flex flex-col gap-2">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Редчайший трофей в коллекции
          </div>
          <div className="flex items-baseline justify-between py-1">
            {/* STRICT MANDATORY INVARIANT: Plain Text Nickname */}
            <PlainTextNickname nickname={stats.best_nickname} size="lg" />
            {stats.best_rarity && <RarityBadge rarity={stats.best_rarity} />}
          </div>
        </div>
      )}

      {/* Settings section */}
      <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-4 flex flex-col gap-3">
        <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider">
          Настройки игры
        </h3>

        {/* Privacy toggle */}
        <div className="flex items-center justify-between py-2 border-b border-slate-800/60">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-slate-200">
              Скрыть баланс в лидерборде
            </span>
            <span className="text-[11px] text-slate-400">
              Другие игроки увидят «••••••» вместо UD
            </span>
          </div>
          <button
            onClick={handleTogglePrivacy}
            disabled={updatingPrivacy}
            className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${
              user.privacy_hide_balance ? 'bg-sky-500' : 'bg-slate-700'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white transition-transform ${
                user.privacy_hide_balance ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Reduced motion toggle */}
        <div className="flex items-center justify-between py-2">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-slate-200">
              Режим пониженной анимации
            </span>
            <span className="text-[11px] text-slate-400">
              Мгновенный показ результата без спецэффектов
            </span>
          </div>
          <button
            onClick={() => {
              haptic.selection();
              onToggleReducedMotion();
            }}
            className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${
              reducedMotion ? 'bg-sky-500' : 'bg-slate-700'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white transition-transform ${
                reducedMotion ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
};
