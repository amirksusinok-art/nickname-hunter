import React from 'react';

export const RARITY_INFO: Record<
  string,
  { label: string; textColor: string; glowColor: string }
> = {
  COMMON: { label: 'Обычный', textColor: 'text-slate-400', glowColor: '#94a3b8' },
  UNCOMMON: { label: 'Необычный', textColor: 'text-emerald-400', glowColor: '#34d399' },
  RARE: { label: 'Редкий', textColor: 'text-sky-400', glowColor: '#38bdf8' },
  EPIC: { label: 'Эпический', textColor: 'text-purple-400', glowColor: '#c084fc' },
  LEGENDARY: { label: 'Легендарный', textColor: 'text-amber-400', glowColor: '#fbbf24' },
  MYTHIC: { label: 'Мифический', textColor: 'text-rose-400', glowColor: '#f43f5e' },
};

export const RarityBadge: React.FC<{ rarity: string; size?: 'sm' | 'md' }> = ({
  rarity,
  size = 'sm',
}) => {
  const norm = (rarity || 'COMMON').toUpperCase();
  const info = RARITY_INFO[norm] || RARITY_INFO.COMMON;
  const sizeClass = size === 'sm' ? 'text-xs font-semibold' : 'text-sm font-bold tracking-wide';

  return (
    <span className={`${info.textColor} ${sizeClass} uppercase tracking-wider`}>
      {info.label}
    </span>
  );
};
