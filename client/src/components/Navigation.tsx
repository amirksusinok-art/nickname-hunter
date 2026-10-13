import React from 'react';
import { Flame, Layers, HandCoins, Trophy, User } from 'lucide-react';
import { haptic } from '../telegram/telegram-sdk.js';

export type TabId = 'hunt' | 'collection' | 'avita' | 'leaderboard' | 'profile';

interface NavigationProps {
  currentTab: TabId;
  onChangeTab: (tab: TabId) => void;
}

export const Navigation: React.FC<NavigationProps> = ({ currentTab, onChangeTab }) => {
  const tabs = [
    { id: 'hunt', label: 'Смена', icon: Flame },
    { id: 'collection', label: 'Коллекция', icon: Layers },
    { id: 'avita', label: 'Авита', icon: HandCoins },
    { id: 'leaderboard', label: 'Лидерборд', icon: Trophy },
    { id: 'profile', label: 'Профиль', icon: User },
  ] as const;

  const handleTabClick = (tabId: TabId) => {
    if (tabId !== currentTab) {
      haptic.selection();
      onChangeTab(tabId);
    }
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#121620]/95 backdrop-blur-md border-t border-slate-800/80 px-2 pb-[max(var(--tg-safe-bottom),8px)] pt-2">
      <div className="max-w-md mx-auto grid grid-cols-5 gap-1">
        {tabs.map(({ id, label, icon: Icon }) => {
          const isActive = currentTab === id;
          return (
            <button
              key={id}
              onClick={() => handleTabClick(id)}
              className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all duration-200 active:scale-95 ${
                isActive
                  ? 'text-sky-400 font-bold'
                  : 'text-slate-400 hover:text-slate-200 font-medium'
              }`}
            >
              <Icon
                className={`w-5 h-5 mb-1 transition-transform ${
                  isActive ? 'scale-110 stroke-[2.5]' : 'stroke-[1.8]'
                }`}
              />
              <span className="text-[11px] leading-tight tracking-tight">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
