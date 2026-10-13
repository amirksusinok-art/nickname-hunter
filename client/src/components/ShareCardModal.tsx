import React, { useRef, useEffect, useState } from 'react';
import { X, Share2, Download, Copy, Check } from 'lucide-react';
import { NicknameItem } from '../api/client.js';
import { getTelegramWebApp, haptic } from '../telegram/telegram-sdk.js';

interface ShareCardModalProps {
  item: NicknameItem;
  onClose: () => void;
}

export const ShareCardModal: React.FC<ShareCardModalProps> = ({ item, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = 800;
    const height = 1000;
    canvas.width = width;
    canvas.height = height;

    // Background gradient for whole poster
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#0a0d14');
    bgGrad.addColorStop(0.5, '#111726');
    bgGrad.addColorStop(1, '#07090e');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Decorative subtle ambient glow in corners (NOT around nickname)
    const ambientGrad = ctx.createRadialGradient(400, 150, 20, 400, 150, 400);
    ambientGrad.addColorStop(0, 'rgba(56, 189, 248, 0.08)');
    ambientGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = ambientGrad;
    ctx.fillRect(0, 0, width, height);

    // App header title
    ctx.font = '700 24px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.fillText('NICKNAME HUNTER', width / 2, 90);

    // Subtitle
    ctx.font = '600 16px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('РЕДКАЯ НАХОДКА НА СМЕНЕ', width / 2, 125);

    // STRICT INVARIANT: The nickname is rendered PURELY AS CLEAN TYPOGRAPHY IN THE CENTER.
    // NO bounding box, NO capsule, NO card, NO outline, NO border, NO surrounding background!
    ctx.font = '800 64px "JetBrains Mono", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(`@${item.nickname.replace(/^@/, '')}`, width / 2, 420);

    // Below the nickname: plain text info (Rarity, Score, Traits)
    // Rarity text
    ctx.font = '700 22px "Plus Jakarta Sans", sans-serif';
    const rarityColors: Record<string, string> = {
      COMMON: '#94a3b8',
      UNCOMMON: '#34d399',
      RARE: '#38bdf8',
      EPIC: '#c084fc',
      LEGENDARY: '#fbbf24',
      MYTHIC: '#f43f5e',
    };
    ctx.fillStyle = rarityColors[item.rarity.toUpperCase()] || '#ffffff';
    ctx.fillText(`ТИР: ${item.rarity.toUpperCase()}`, width / 2, 530);

    // Score text
    ctx.font = '800 36px "JetBrains Mono", monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`SCORE: ${item.score} / 1000`, width / 2, 600);

    // Traits (if any) as plain text
    if (item.traits && item.traits.length > 0) {
      ctx.font = '500 18px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(`ТЕГИ: ${item.traits.join('  •  ')}`, width / 2, 660);
    }

    // Footer divider line
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(100, 850);
    ctx.lineTo(700, 850);
    ctx.stroke();

    // Footer brand & link
    ctx.font = '600 18px "JetBrains Mono", monospace';
    ctx.fillStyle = '#64748b';
    ctx.fillText('t.me/NickHunterBot', width / 2, 900);

    setDataUrl(canvas.toDataURL('image/png'));
  }, [item]);

  const handleShare = () => {
    haptic.impact('medium');
    const tg = getTelegramWebApp();
    const shareText = `Я выбил редкий ник @${item.nickname.replace(/^@/, '')} со счетом ${item.score}/1000 в Nickname Hunter!`;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent('https://t.me/NickHunterBot')}&text=${encodeURIComponent(shareText)}`;

    if (tg?.openTelegramLink) {
      tg.openTelegramLink(shareUrl);
    } else {
      window.open(shareUrl, '_blank');
    }
  };

  const handleCopy = () => {
    haptic.selection();
    navigator.clipboard.writeText(`@${item.nickname.replace(/^@/, '')}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#121620] border border-slate-800 rounded-3xl w-full max-w-sm overflow-hidden flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h3 className="font-bold text-slate-100 text-lg">Поделиться никнеймом</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-slate-100 active:scale-95 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 flex flex-col items-center">
          <canvas ref={canvasRef} className="hidden" />

          {dataUrl ? (
            <img
              src={dataUrl}
              alt="Share card"
              className="w-full rounded-2xl border border-slate-800/80 shadow-lg object-contain max-h-[360px]"
            />
          ) : (
            <div className="w-full h-64 bg-slate-900 rounded-2xl flex items-center justify-center text-slate-500">
              Генерация...
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 w-full mt-4">
            <button
              onClick={handleShare}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 active:scale-95 text-white font-bold text-sm transition-all"
            >
              <Share2 className="w-4 h-4" />
              В Telegram
            </button>
            <button
              onClick={handleCopy}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 font-semibold text-sm transition-all"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Скопировано' : 'Копировать ник'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
