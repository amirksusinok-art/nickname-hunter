import React, { useState, useEffect } from 'react';
import { Heart, Trophy, Trash2, Share2, ArrowRight, ShieldCheck, Filter } from 'lucide-react';
import { api, NicknameItem } from '../api/client.js';
import { PlainTextNickname } from '../components/PlainTextNickname.js';
import { RarityBadge } from '../components/RarityBadge.js';
import { ShareCardModal } from '../components/ShareCardModal.js';
import { haptic } from '../telegram/telegram-sdk.js';

interface CollectionScreenProps {
  onSelectForAvita: (itemId: string) => void;
  onBalanceChange: (newBalance: number) => void;
}

export const CollectionScreen: React.FC<CollectionScreenProps> = ({
  onSelectForAvita,
  onBalanceChange,
}) => {
  const [items, setItems] = useState<NicknameItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string>('ALL');
  const [sharingItem, setSharingItem] = useState<NicknameItem | null>(null);
  const [dismantleConfirmItem, setDismantleConfirmItem] = useState<NicknameItem | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadCollection = async () => {
    try {
      setLoading(true);
      const res = await api.getCollection();
      setItems(res.items);
    } catch (err: any) {
      console.error('Failed to load collection:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCollection();
  }, []);

  const handleToggleFavorite = async (itemId: string) => {
    haptic.selection();
    try {
      const res = await api.toggleFavorite(itemId);
      setItems((prev) =>
        prev.map((it) => (it.id === itemId ? { ...it, is_favorite: res.is_favorite } : it))
      );
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  const handleSetShowcase = async (itemId: string) => {
    haptic.impact('medium');
    try {
      await api.setShowcase(itemId);
      setItems((prev) =>
        prev.map((it) => ({
          ...it,
          is_showcased: it.id === itemId,
        }))
      );
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  const handleConfirmDismantle = async () => {
    if (!dismantleConfirmItem) return;
    haptic.impact('medium');

    try {
      const res = await api.dismantleItem(dismantleConfirmItem.id);
      onBalanceChange(res.newBalance);
      setItems((prev) => prev.filter((it) => it.id !== dismantleConfirmItem.id));
      setDismantleConfirmItem(null);
    } catch (err: any) {
      setActionError(err.message);
      setDismantleConfirmItem(null);
    }
  };

  const filteredItems = items.filter((item) => {
    if (activeFilter === 'FAVORITES') return item.is_favorite;
    if (activeFilter === 'ALL') return true;
    return item.rarity.toUpperCase() === activeFilter;
  });

  return (
    <div className="flex flex-col min-h-[calc(100vh-120px)] px-4 pb-24 pt-4 max-w-md mx-auto w-full">
      {/* Header & Stats */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-xl font-black text-slate-100">Коллекция никнеймов</h2>
          <p className="text-xs text-slate-400">Всего предметов: {items.length}</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none mb-3">
        {['ALL', 'FAVORITES', 'MYTHIC', 'LEGENDARY', 'EPIC', 'RARE', 'UNCOMMON', 'COMMON'].map(
          (filter) => (
            <button
              key={filter}
              onClick={() => {
                haptic.selection();
                setActiveFilter(filter);
              }}
              className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                activeFilter === filter
                  ? 'bg-sky-500 text-white'
                  : 'bg-slate-900/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              {filter === 'ALL'
                ? 'Все'
                : filter === 'FAVORITES'
                ? '★ Избранное'
                : filter}
            </button>
          )
        )}
      </div>

      {actionError && (
        <div className="mb-3 text-xs text-rose-400 bg-rose-950/40 border border-rose-800/60 rounded-xl px-3 py-2">
          {actionError}
        </div>
      )}

      {/* Item List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 text-sm">
          Загрузка коллекции...
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-slate-400 font-medium text-sm">В этой категории пока пусто</p>
          <p className="text-slate-500 text-xs mt-1">Выбивайте новые ники на вкладке «Смена»</p>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-slate-800/60">
          {filteredItems.map((item) => {
            const isProtected = item.is_favorite || item.is_showcased;

            return (
              <div
                key={item.id}
                className="py-4 flex flex-col gap-2 transition-colors"
              >
                {/* STRICT UI-INVARIANT: Nickname rendered purely as clean typography */}
                <div className="flex items-baseline justify-between">
                  <PlainTextNickname nickname={item.nickname} size="lg" />
                  <div className="flex items-center gap-2">
                    <RarityBadge rarity={item.rarity} />
                    <span className="font-mono text-xs font-bold text-sky-400">
                      {item.score}
                    </span>
                  </div>
                </div>

                {/* Subtitle / Traits / Badges */}
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    {item.is_showcased && (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-amber-400">
                        <Trophy className="w-3 h-3" /> На витрине
                      </span>
                    )}
                    {item.traits && item.traits.length > 0 && (
                      <span className="text-[11px] text-slate-500 font-mono">
                        {item.traits.join(' ')}
                      </span>
                    )}
                  </div>

                  {/* Actions toolbar */}
                  <div className="flex items-center gap-2">
                    {/* Favorite */}
                    <button
                      onClick={() => handleToggleFavorite(item.id)}
                      className={`p-1.5 rounded-lg active:scale-90 transition-colors ${
                        item.is_favorite
                          ? 'text-rose-400 bg-rose-950/30'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Избранное"
                    >
                      <Heart
                        className={`w-4 h-4 ${item.is_favorite ? 'fill-rose-400' : ''}`}
                      />
                    </button>

                    {/* Showcase */}
                    <button
                      onClick={() => handleSetShowcase(item.id)}
                      className={`p-1.5 rounded-lg active:scale-90 transition-colors ${
                        item.is_showcased
                          ? 'text-amber-400 bg-amber-950/30'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Выставить в лидерборд"
                    >
                      <Trophy className="w-4 h-4" />
                    </button>

                    {/* Share */}
                    <button
                      onClick={() => {
                        haptic.selection();
                        setSharingItem(item);
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 active:scale-90 transition-colors"
                      title="Поделиться"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>

                    {/* Sell to Avita shortcut */}
                    {!isProtected && (
                      <button
                        onClick={() => {
                          haptic.selection();
                          onSelectForAvita(item.id);
                        }}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-950/40 text-emerald-400 hover:bg-emerald-900/50 text-[11px] font-bold active:scale-95 transition-all"
                        title="Продать Авите"
                      >
                        Авите <ArrowRight className="w-3 h-3" />
                      </button>
                    )}

                    {/* Dismantle */}
                    {!isProtected ? (
                      <button
                        onClick={() => {
                          haptic.selection();
                          setDismantleConfirmItem(item);
                        }}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 active:scale-90 transition-colors"
                        title="Разобрать"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    ) : (
                      <span
                        className="p-1.5 text-slate-600"
                        title="Защищено от продажи и разбора"
                      >
                        <ShieldCheck className="w-4 h-4" />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Share Modal */}
      {sharingItem && (
        <ShareCardModal item={sharingItem} onClose={() => setSharingItem(null)} />
      )}

      {/* Dismantle Duplicate Confirmation Modal */}
      {dismantleConfirmItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#121620] border border-slate-800 rounded-3xl w-full max-w-sm p-5 shadow-2xl flex flex-col gap-4">
            <h3 className="font-bold text-slate-100 text-lg">Подтвердите разбор</h3>
            <p className="text-xs text-slate-300">
              Вы уверены, что хотите разобрать ник{' '}
              <span className="font-mono font-bold text-slate-100">
                @{dismantleConfirmItem.nickname}
              </span>
              ? Предмет будет удален навсегда.
            </p>

            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 flex justify-between items-center text-xs">
              <span className="text-slate-400">Награда за разбор:</span>
              <span className="font-mono font-bold text-amber-400 text-sm">
                +
                {Math.round(
                  ((dismantleConfirmItem.rarity.toUpperCase() === 'MYTHIC'
                    ? 12000
                    : dismantleConfirmItem.rarity.toUpperCase() === 'LEGENDARY'
                    ? 3500
                    : dismantleConfirmItem.rarity.toUpperCase() === 'EPIC'
                    ? 1200
                    : dismantleConfirmItem.rarity.toUpperCase() === 'RARE'
                    ? 450
                    : dismantleConfirmItem.rarity.toUpperCase() === 'UNCOMMON'
                    ? 200
                    : 100)) * 0.5
                )}{' '}
                UD
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                onClick={() => setDismantleConfirmItem(null)}
                className="py-2.5 px-4 rounded-xl bg-slate-800 text-slate-300 font-semibold text-xs active:scale-95 transition-all"
              >
                Отмена
              </button>
              <button
                onClick={handleConfirmDismantle}
                className="py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs active:scale-95 transition-all"
              >
                Разобрать
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
