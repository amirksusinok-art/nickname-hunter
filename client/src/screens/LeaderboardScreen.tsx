import React, { useState, useEffect } from 'react';
import { Trophy, Medal, Crown, User, Sparkles } from 'lucide-react';
import { api, LeaderboardEntry } from '../api/client.js';
import { PlainTextNickname } from '../components/PlainTextNickname.js';
import { RarityBadge } from '../components/RarityBadge.js';
import { haptic } from '../telegram/telegram-sdk.js';

export const LeaderboardScreen: React.FC = () => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRank, setUserRank] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await api.getLeaderboard();
        setEntries(res.leaderboard);
        setUserRank(res.userRank);
      } catch (err: any) {
        console.error('Failed to load leaderboard:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const getRankBadge = (rank: number) => {
    if (rank === 1) return <Crown className="w-5 h-5 text-amber-400" />;
    if (rank === 2) return <Medal className="w-5 h-5 text-slate-300" />;
    if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />;
    return <span className="font-mono font-bold text-xs text-slate-500">#{rank}</span>;
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-120px)] px-4 pb-24 pt-4 max-w-md mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-black text-slate-100 flex items-center gap-2">
            <Trophy className="w-6 h-6 text-amber-400" /> Лидерборд витрин
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Топ-50 редчайших находок игроков
          </p>
        </div>
        {userRank && (
          <div className="bg-sky-500/10 border border-sky-500/30 rounded-xl px-3 py-1.5 text-right">
            <div className="text-[10px] text-sky-400 font-bold uppercase">Ваше место</div>
            <div className="font-mono font-extrabold text-sm text-sky-300">#{userRank}</div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 text-sm">
          Загрузка лидерборда...
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-slate-400 font-medium text-sm">Витрины пока пусты</p>
          <p className="text-slate-500 text-xs mt-1">
            Выставьте лучший ник из коллекции в лидерборд!
          </p>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-slate-800/60">
          {entries.map((entry) => (
            <div
              key={`${entry.userId}-${entry.item.id}`}
              className={`py-3.5 flex items-center gap-3 transition-colors ${
                entry.isMe ? 'bg-sky-950/20 px-2 rounded-xl' : ''
              }`}
            >
              {/* Rank */}
              <div className="w-8 flex items-center justify-center shrink-0">
                {getRankBadge(entry.rank)}
              </div>

              {/* Main Info */}
              <div className="flex flex-col flex-1 min-w-0">
                {/* STRICT MANDATORY INVARIANT: Plain Text Nickname */}
                <div className="flex items-baseline gap-2">
                  <PlainTextNickname nickname={entry.item.nickname} size="md" />
                  <RarityBadge rarity={entry.item.rarity} />
                </div>

                <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-1">
                  <span className="font-semibold text-slate-300 truncate max-w-[120px]">
                    {entry.username}
                  </span>
                  <span>•</span>
                  <span>{entry.level} ур.</span>
                  <span>•</span>
                  <span className="font-mono text-slate-400">
                    {typeof entry.balance === 'number'
                      ? `${entry.balance} UD`
                      : entry.balance}
                  </span>
                </div>
              </div>

              {/* Score */}
              <div className="text-right shrink-0">
                <div className="font-mono font-black text-sky-400 text-base">
                  {entry.item.score}
                </div>
                <div className="text-[10px] text-slate-500 uppercase font-bold">ОЧКОВ</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
