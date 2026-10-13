import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Sparkles, Coins, Zap, Share2, AlertCircle } from 'lucide-react';
import { api, NicknameItem, ScoreBreakdown } from '../api/client.js';
import { PlainTextNickname } from '../components/PlainTextNickname.js';
import { RarityBadge } from '../components/RarityBadge.js';
import { ShareCardModal } from '../components/ShareCardModal.js';
import { haptic } from '../telegram/telegram-sdk.js';

interface HuntScreenProps {
  balance: number;
  pityCounter: number;
  reducedMotion: boolean;
  onBalanceChange: (newBalance: number) => void;
  onPityChange: (newPity: number) => void;
}

export const HuntScreen: React.FC<HuntScreenProps> = ({
  balance,
  pityCounter,
  reducedMotion,
  onBalanceChange,
  onPityChange,
}) => {
  const [isRolling, setIsRolling] = useState(false);
  const [droppedItem, setDroppedItem] = useState<NicknameItem | null>(null);
  const [scoreBreakdown, setScoreBreakdown] = useState<ScoreBreakdown | null>(null);
  const [sharingItem, setSharingItem] = useState<NicknameItem | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reelText, setReelText] = useState<string>('???');

  const cost = 500;
  const isAffordable = balance >= cost;
  const missing = cost - balance;

  // Calculate soft pity status label
  const getPityLabel = () => {
    if (pityCounter >= 100) return '🔥 Hard Pity: 100% Epic+ гарантирован!';
    if (pityCounter >= 10) {
      const chance = Math.min(20, 7 + 0.5 * (pityCounter - 9)).toFixed(1);
      return `⚡ Soft Pity (${pityCounter}/100): Epic+ ${chance}%`;
    }
    return `Счетчик Pity: ${pityCounter}/100 (Epic+ 7.0%)`;
  };

  const REEL_POOL = [
    'kai', 'zen', 'sky', 'neo', 'void', 'zero', 'flux', 'ziv', '777', 'nox',
    'apex', 'echo', 'pure', 'v1p', 'xox', 'luna', 'aura', 'mars', 'arc', 'fox',
    'lux', 'ai', 'dusk', 'cyber', 'frost', 'ghost', 'pulse', 'blade', 'sol', 'raw'
  ];

  const handleRoll = async () => {
    if (!isAffordable || isRolling) return;

    setErrorMsg(null);
    setIsRolling(true);
    setDroppedItem(null);
    haptic.impact('medium');

    try {
      const idempotencyKey = `roll_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      // Fetch drop result from server
      const rollPromise = api.rollDrop(idempotencyKey);

      // Kinetic deceleration animation if animations enabled
      if (!reducedMotion) {
        // Step delays gradually increasing to create realistic slot machine deceleration
        const stepDelays = [45, 45, 50, 55, 65, 80, 105, 135, 175, 230, 300, 420];
        for (let i = 0; i < stepDelays.length; i++) {
          const randomPreview = REEL_POOL[Math.floor(Math.random() * REEL_POOL.length)];
          setReelText(randomPreview);
          // Mechanical wheel tick feel in user's hand
          haptic.selection();
          await new Promise((r) => setTimeout(r, stepDelays[i]));
        }
      }

      const result = await rollPromise;

      setDroppedItem(result.item);
      setScoreBreakdown(result.scoreBreakdown);
      onBalanceChange(result.newBalance);
      onPityChange(result.newPityCounter);

      // Haptics & celebration on reveal
      const rarity = result.item.rarity.toUpperCase();
      if (['MYTHIC', 'LEGENDARY'].includes(rarity)) {
        haptic.impact('heavy');
        confetti({
          particleCount: 90,
          spread: 80,
          origin: { y: 0.55 },
          colors:
            rarity === 'MYTHIC'
              ? ['#f43f5e', '#fb7185', '#fda4af', '#ffffff']
              : ['#fbbf24', '#f59e0b', '#d97706', '#fef08a'],
        });
      } else if (rarity === 'EPIC') {
        haptic.impact('medium');
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.55 },
          colors: ['#c084fc', '#a855f7', '#e9d5ff'],
        });
      } else {
        haptic.impact('medium');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Ошибка выбивания ника');
      haptic.notification('error');
    } finally {
      setIsRolling(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-between min-h-[calc(100vh-120px)] px-4 pb-20 pt-4">
      {/* Top Status: Balance & Pity */}
      <div className="w-full max-w-sm flex flex-col gap-2">
        <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800/80 rounded-2xl px-4 py-2.5 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-400" />
            <span className="text-xs text-slate-400">Баланс:</span>
            <span className="font-mono font-bold text-slate-100 text-sm">{balance} UD</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
            <Zap className="w-3.5 h-3.5 text-sky-400" />
            <span className="font-mono text-sky-300 font-bold">{pityCounter}</span>/100
          </div>
        </div>

        {/* Pity bar */}
        <div className="w-full bg-slate-900/40 rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              pityCounter >= 100
                ? 'bg-rose-500'
                : pityCounter >= 10
                ? 'bg-sky-400'
                : 'bg-slate-700'
            }`}
            style={{ width: `${Math.min(100, (pityCounter / 100) * 100)}%` }}
          />
        </div>
        <div className="text-[11px] text-center text-slate-400 font-medium">{getPityLabel()}</div>
      </div>

      {/* Center Stage: Nickname presentation */}
      <div className="my-auto flex flex-col items-center justify-center py-8 w-full text-center">
        {droppedItem ? (
          <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-2">
              <RarityBadge rarity={droppedItem.rarity} size="md" />
              <span className="text-slate-500">•</span>
              <span className="font-mono font-extrabold text-sky-400 text-sm">
                {droppedItem.score} pts
              </span>
            </div>

            {/* STRICT MANDATORY INVARIANT: PURE PLAIN TEXT ONLY. NO CARDS, NO CAPSULES. */}
            <div className="py-2">
              <PlainTextNickname nickname={droppedItem.nickname} size="2xl" />
            </div>

            {/* Traits */}
            {droppedItem.traits && droppedItem.traits.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5 max-w-xs">
                {droppedItem.traits.map((t) => (
                  <span
                    key={t}
                    className="text-[11px] text-slate-400 font-mono tracking-tight"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}

            {/* Share button */}
            <button
              onClick={() => {
                haptic.selection();
                setSharingItem(droppedItem);
              }}
              className="mt-2 flex items-center gap-1.5 text-xs text-slate-400 hover:text-sky-300 active:scale-95 transition-colors font-medium py-1 px-3"
            >
              <Share2 className="w-3.5 h-3.5" />
              Поделиться находкой
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="text-slate-500 text-xs uppercase tracking-widest font-semibold">
              Готов к охоте
            </div>
            {/* STRICT MANDATORY INVARIANT: Reel is pure text */}
            <div className="py-2">
              <PlainTextNickname
                nickname={isRolling ? reelText : '???'}
                size="2xl"
                className="text-slate-500 opacity-60"
              />
            </div>
            <div className="text-slate-400 text-xs">
              Нажмите кнопку внизу для выбивания уникального никнейма
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="mt-4 flex items-center gap-2 text-rose-400 text-xs bg-rose-950/40 border border-rose-800/60 rounded-xl px-3 py-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Bottom CTA Button */}
      <div className="w-full max-w-sm flex flex-col gap-2">
        <button
          onClick={handleRoll}
          disabled={!isAffordable || isRolling}
          className={`w-full py-4 px-6 rounded-2xl font-black text-base tracking-wide flex items-center justify-center gap-2 transition-all shadow-xl active:scale-98 ${
            isAffordable && !isRolling
              ? 'bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white shadow-sky-500/20 cursor-pointer'
              : 'bg-slate-800/80 text-slate-500 border border-slate-700/50 cursor-not-allowed'
          }`}
        >
          <Sparkles className={`w-5 h-5 ${isRolling ? 'animate-spin' : ''}`} />
          {isRolling
            ? 'ВЫБИВАНИЕ...'
            : isAffordable
            ? `ВЫБИТЬ НИК • ${cost} UD`
            : `НЕДОСТАТОЧНО ${missing} UD`}
        </button>

        {!isAffordable && (
          <p className="text-[11px] text-center text-rose-400/90 font-medium">
            Для попытки требуется {cost} UD. Продайте никнейм у Авиты или выполните разбор.
          </p>
        )}
      </div>

      {/* Share Modal */}
      {sharingItem && (
        <ShareCardModal item={sharingItem} onClose={() => setSharingItem(null)} />
      )}
    </div>
  );
};
