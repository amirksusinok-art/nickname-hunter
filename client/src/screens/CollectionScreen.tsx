import React, { useState, useEffect } from 'react';
import {
  Heart,
  Trophy,
  Trash2,
  Share2,
  ArrowRight,
  ShieldCheck,
  CheckSquare,
  Square,
  Layers,
  Coins,
  X,
} from 'lucide-react';
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

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bulkOutcome, setBulkOutcome] = useState<string | null>(null);

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

  const eligibleItems = items.filter((it) => !it.is_favorite && !it.is_showcased);
  const eligibleFilteredItems = filteredItems.filter((it) => !it.is_favorite && !it.is_showcased);
  const protectedFilteredCount = filteredItems.length - eligibleFilteredItems.length;

  const toggleSelectItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    haptic.selection();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allFilteredSelected =
    eligibleFilteredItems.length > 0 &&
    eligibleFilteredItems.every((it) => selectedIds.has(it.id));

  const handleSelectAll = () => {
    haptic.selection();
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const it of eligibleFilteredItems) {
          next.delete(it.id);
        }
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const it of eligibleFilteredItems) {
          next.add(it.id);
        }
        return next;
      });
    }
  };

  const handleSelectByRarity = (rarities: string[]) => {
    haptic.selection();
    const matched = eligibleFilteredItems.filter((it) =>
      rarities.includes(it.rarity.toUpperCase())
    );
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const it of matched) {
        next.add(it.id);
      }
      return next;
    });
  };

  const calculateBulkEst = () => {
    const selected = items.filter((it) => selectedIds.has(it.id));
    const basePrices: Record<string, number> = {
      COMMON: 100,
      UNCOMMON: 200,
      RARE: 450,
      EPIC: 1200,
      LEGENDARY: 3500,
      MYTHIC: 12000,
    };

    let total = 0;
    for (const it of selected) {
      const b = basePrices[it.rarity.toUpperCase()] || 100;
      const s = it.score;
      const k = it.traits ? Math.min(5, it.traits.length) : 0;
      const p = Math.round(b * (0.75 + 0.5 * (s / 1000)) * (1 + Math.min(0.15, 0.03 * k)));
      total += p;
    }

    const bonusPct = selected.length >= 10 ? 10 : selected.length >= 5 ? 5 : 0;
    const finalTotal = Math.round(total * (1 + bonusPct / 100));

    return { count: selected.length, baseTotal: total, bonusPct, finalTotal };
  };

  const handleExecuteBulkSell = async () => {
    if (selectedIds.size === 0 || submitting) return;
    setSubmitting(true);
    haptic.impact('heavy');

    try {
      const res = await api.bulkSell(Array.from(selectedIds));
      haptic.notification('success');
      onBalanceChange(res.newBalance);
      setBulkOutcome(res.message);
      setSelectedIds(new Set());
      setBulkModalOpen(false);

      const updated = await api.getCollection();
      setItems(updated.items);
    } catch (err: any) {
      setActionError(err.message || 'Ошибка оптовой продажи');
      haptic.notification('error');
    } finally {
      setSubmitting(false);
    }
  };

  const bulkEst = calculateBulkEst();

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

      {bulkOutcome && (
        <div className="mb-3 bg-emerald-950/40 border border-emerald-800/60 rounded-2xl p-3 flex items-center justify-between animate-in fade-in">
          <span className="text-xs text-emerald-300 font-medium">{bulkOutcome}</span>
          <button
            onClick={() => setBulkOutcome(null)}
            className="text-slate-400 hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Multi-Select Toolbar & Quick Filters */}
      {eligibleFilteredItems.length > 0 && (
        <div className="flex flex-col gap-2 mb-3 bg-slate-900/40 border border-slate-800/60 rounded-2xl p-2.5">
          <div className="flex items-center justify-between">
            <button
              onClick={handleSelectAll}
              className="text-xs font-bold text-sky-400 hover:text-sky-300 transition-colors"
            >
              {allFilteredSelected ? 'Снять всё' : 'Выбрать все'}
            </button>
            {protectedFilteredCount > 0 && selectedIds.size > 0 && (
              <span className="text-[10px] text-slate-500">
                ({protectedFilteredCount} защищённых пропущены)
              </span>
            )}
            {selectedIds.size > 0 && (
              <span className="text-[11px] font-mono font-bold text-amber-300">
                Выбрано: {selectedIds.size} шт.
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-[11px]">
            <span className="text-slate-500 text-[10px]">Выбрать:</span>
            <button
              onClick={() => handleSelectByRarity(['COMMON'])}
              className="px-2 py-0.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-medium"
            >
              Обычные
            </button>
            <button
              onClick={() => handleSelectByRarity(['COMMON', 'UNCOMMON'])}
              className="px-2 py-0.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-emerald-300 font-medium"
            >
              Обычные + Необычные
            </button>
          </div>
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
            const isSelected = selectedIds.has(item.id);

            return (
              <div
                key={item.id}
                className={`py-4 flex flex-col gap-2 transition-colors rounded-xl px-2 ${
                  isSelected ? 'bg-sky-950/20' : ''
                }`}
              >
                {/* STRICT UI-INVARIANT: Nickname rendered purely as clean typography */}
                <div className="flex items-baseline justify-between">
                  <div className="flex items-center gap-2">
                    {!isProtected ? (
                      <button
                        onClick={(e) => toggleSelectItem(item.id, e)}
                        className="text-slate-400 hover:text-sky-400 transition-colors shrink-0"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-sky-400" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-600" />
                        )}
                      </button>
                    ) : (
                      <span className="text-slate-700 shrink-0" title="Защищено">
                        <Square className="w-4 h-4 opacity-30" />
                      </span>
                    )}
                    <PlainTextNickname nickname={item.nickname} size="lg" />
                  </div>
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

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-16 left-0 right-0 max-w-md mx-auto px-4 z-40">
          <div className="bg-slate-900 border border-sky-500/40 rounded-2xl p-3 shadow-2xl flex items-center justify-between backdrop-blur-md animate-in slide-in-from-bottom-3">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-200">
                Выбрано: <span className="text-sky-400">{bulkEst.count}</span> шт.
              </span>
              <span className="text-[11px] text-amber-300 font-mono font-medium">
                ~{bulkEst.finalTotal} UD {bulkEst.bonusPct > 0 ? `(+${bulkEst.bonusPct}% опт)` : ''}
              </span>
            </div>

            <button
              onClick={() => {
                haptic.impact('medium');
                setBulkModalOpen(true);
              }}
              className="py-2 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs active:scale-95 transition-all flex items-center gap-1.5 shadow-lg shadow-amber-500/20"
            >
              <Coins className="w-4 h-4" />
              <span>Продать выбранное у Авиты ({selectedIds.size} шт.)</span>
            </button>
          </div>
        </div>
      )}

      {/* Bulk Sell Confirmation Modal */}
      {bulkModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 max-w-sm w-full shadow-2xl flex flex-col gap-3">
            <div className="flex items-center gap-2 text-amber-400 font-black text-sm">
              <Layers className="w-4 h-4" />
              <span>Оптовая сделка с Авитой</span>
            </div>

            <div className="bg-slate-800/70 border border-slate-700/60 rounded-2xl p-3.5 text-xs text-slate-200 leading-relaxed">
              <span className="font-bold text-amber-300 block mb-1">Скупщик Авита:</span>
              {bulkEst.count === 1 ? (
                <>«Вижу этот никнейм! Готов забрать его сразу за <span className="font-mono font-bold text-amber-400 text-sm">{bulkEst.finalTotal} UD</span>. Ударим по рукам или хочешь поторговаться?»</>
              ) : (
                <>
                  «Ого, оптовая партия на <span className="font-bold text-sky-300">{bulkEst.count}</span> {bulkEst.count < 5 ? 'ника' : 'ников'}!
                  {bulkEst.bonusPct > 0
                    ? ` За партию от ${bulkEst.bonusPct >= 10 ? '10' : '5'} штук накинул оптовый бонус +${bulkEst.bonusPct}%! `
                    : ' '}
                  Забираю всё оптом за <span className="font-mono font-bold text-amber-400 text-sm">{bulkEst.finalTotal} UD</span>. Ударим по рукам?»
                </>
              )}
            </div>

            <div className="flex flex-col gap-1.5 mt-2">
              <button
                onClick={handleExecuteBulkSell}
                disabled={submitting}
                className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
              >
                <span>💬 {bulkEst.count === 1 ? '«По рукам! Продать по оценке»' : '«По рукам! Продать всё оптом»'}</span>
              </button>
              {selectedIds.size === 1 && (
                <button
                  onClick={() => {
                    const firstId = Array.from(selectedIds)[0];
                    setBulkModalOpen(false);
                    onSelectForAvita(firstId);
                  }}
                  disabled={submitting}
                  className="w-full py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs active:scale-95 transition-all flex items-center justify-center gap-2 shadow-sm"
                >
                  <span>💬 «Торговаться с Авитой за этот ник»</span>
                </button>
              )}
              <button
                onClick={() => setBulkModalOpen(false)}
                disabled={submitting}
                className="w-full py-2 text-center text-xs text-slate-400 hover:text-slate-200 font-medium"
              >
                «Погоди, я ещё подумаю»
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
