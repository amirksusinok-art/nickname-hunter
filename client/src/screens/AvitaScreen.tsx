import React, { useState, useEffect } from 'react';
import {
  HandCoins,
  ArrowRight,
  Check,
  X,
  MessageSquare,
  Sparkles,
  CheckSquare,
  Square,
  Layers,
  Coins,
} from 'lucide-react';
import { api, AvitaDeal, NicknameItem } from '../api/client.js';
import { PlainTextNickname } from '../components/PlainTextNickname.js';
import { RarityBadge } from '../components/RarityBadge.js';
import { haptic } from '../telegram/telegram-sdk.js';

interface AvitaScreenProps {
  preselectedItemId: string | null;
  onClearPreselectedItem: () => void;
  onBalanceChange: (newBalance: number) => void;
}

interface ChatMessage {
  id: string;
  sender: 'player' | 'avita';
  text: string;
  item?: NicknameItem;
  priceTag?: number;
  time: string;
}

export const AvitaScreen: React.FC<AvitaScreenProps> = ({
  preselectedItemId,
  onClearPreselectedItem,
  onBalanceChange,
}) => {
  const [activeDeal, setActiveDeal] = useState<AvitaDeal | null>(null);
  const [collection, setCollection] = useState<NicknameItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Multi-select state for bulk sale
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkOutcome, setBulkOutcome] = useState<string | null>(null);

  // Interactive dialogue messages history
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [dealRes, collRes] = await Promise.all([
        api.getActiveDeal(),
        api.getCollection(),
      ]);

      setCollection(collRes.items);

      if (dealRes.activeDeal) {
        setActiveDeal(dealRes.activeDeal);
        initDealDialogue(dealRes.activeDeal);
      } else if (preselectedItemId) {
        handleStartQuote(preselectedItemId);
      }
    } catch (err: any) {
      console.error('Failed to load Avita data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const formatTime = () => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  };

  const initDealDialogue = (deal: AvitaDeal) => {
    const item = deal.item;
    if (!item) return;
    const initialPrice = deal.initial_price;
    const finalPrice = deal.final_price;

    const msgs: ChatMessage[] = [
      {
        id: 'msg-1',
        sender: 'player',
        text: `Авита, посмотри на этот никнейм: @${item.nickname.replace(/^@/, '')} (${item.rarity}, ${item.score} pts). Что предложишь?`,
        item,
        time: formatTime(),
      },
      {
        id: 'msg-2',
        sender: 'avita',
        text: finalPrice
          ? `Я уже сделал встречное предложение: ${finalPrice} UD. Берёшь или уходишь?`
          : `Хм-м... @${item.nickname.replace(/^@/, '')}? ${
              item.rarity === 'MYTHIC' || item.rarity === 'LEGENDARY'
                ? 'Редчайшая находка, чистый стиль! Готов раскошелиться.'
                : 'Неплохой экземпляр, найдёт своего покупателя.'
            } Предлагаю ${initialPrice} UD. По рукам?`,
        priceTag: finalPrice || initialPrice,
        time: formatTime(),
      },
    ];

    setMessages(msgs);
  };

  const handleStartQuote = async (itemId: string) => {
    setSubmitting(true);
    haptic.impact('medium');

    try {
      const res = await api.createQuote(itemId);
      setActiveDeal(res.deal);
      initDealDialogue(res.deal);
      onClearPreselectedItem();
    } catch (err: any) {
      haptic.notification('error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNegotiate = async (action: string, playerPhrase: string) => {
    if (!activeDeal || submitting) return;
    setSubmitting(true);
    haptic.impact('medium');

    // Add player reply message to dialogue
    const playerMsg: ChatMessage = {
      id: `p-${Date.now()}`,
      sender: 'player',
      text: playerPhrase,
      time: formatTime(),
    };
    setMessages((prev) => [...prev, playerMsg]);

    try {
      const res = await api.negotiateDeal(activeDeal.id, action);

      if (res.status === 'ACCEPTED') {
        haptic.notification('success');
        onBalanceChange(res.newBalance!);

        const avitaReply: ChatMessage = {
          id: `a-${Date.now()}`,
          sender: 'avita',
          text: `${res.message} Перевожу тебе +${res.finalPrice} UD!`,
          priceTag: res.finalPrice,
          time: formatTime(),
        };
        setMessages((prev) => [...prev, avitaReply]);

        setTimeout(async () => {
          setActiveDeal(null);
          const updated = await api.getCollection();
          setCollection(updated.items);
        }, 1800);
      } else {
        // Counter offer / reject
        const avitaReply: ChatMessage = {
          id: `a-${Date.now()}`,
          sender: 'avita',
          text: res.message,
          priceTag: res.offeredPrice || activeDeal.initial_price,
          time: formatTime(),
        };
        setMessages((prev) => [...prev, avitaReply]);

        setActiveDeal((prev) =>
          prev
            ? {
                ...prev,
                action_type: action,
                final_price: res.offeredPrice || prev.initial_price,
                canBargain: false,
              }
            : null
        );
      }
    } catch (err: any) {
      haptic.notification('error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcceptOffered = async () => {
    if (!activeDeal || submitting) return;
    setSubmitting(true);
    haptic.impact('medium');

    const acceptedPrice = activeDeal.final_price || activeDeal.initial_price;
    const playerMsg: ChatMessage = {
      id: `p-${Date.now()}`,
      sender: 'player',
      text: `Хорошо, Авита. Забирай за ${acceptedPrice} UD.`,
      time: formatTime(),
    };
    setMessages((prev) => [...prev, playerMsg]);

    try {
      const res = await api.acceptCounterOffer(activeDeal.id);
      haptic.notification('success');
      onBalanceChange(res.newBalance);

      const avitaReply: ChatMessage = {
        id: `a-${Date.now()}`,
        sender: 'avita',
        text: `${res.message} Перевёл +${res.finalPrice} UD в кошелёк.`,
        priceTag: res.finalPrice,
        time: formatTime(),
      };
      setMessages((prev) => [...prev, avitaReply]);

      setTimeout(async () => {
        setActiveDeal(null);
        const updated = await api.getCollection();
        setCollection(updated.items);
      }, 1800);
    } catch (err: any) {
      haptic.notification('error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!activeDeal || submitting) return;
    setSubmitting(true);
    haptic.selection();

    try {
      await api.cancelDeal(activeDeal.id);
      setActiveDeal(null);
      setMessages([]);
    } catch (err: any) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  // Bulk selection helpers
  const eligibleItems = collection.filter((it) => !it.is_favorite && !it.is_showcased);

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

  const handleSelectAll = () => {
    haptic.selection();
    if (selectedIds.size === eligibleItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(eligibleItems.map((it) => it.id)));
    }
  };

  const handleSelectByRarity = (rarities: string[]) => {
    haptic.selection();
    const matched = eligibleItems.filter((it) => rarities.includes(it.rarity.toUpperCase()));
    setSelectedIds(new Set(matched.map((it) => it.id)));
  };

  const calculateBulkEst = () => {
    const selected = eligibleItems.filter((it) => selectedIds.has(it.id));
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
      setCollection(updated.items);
    } catch (err: any) {
      alert(err.message || 'Ошибка оптовой продажи');
      haptic.notification('error');
    } finally {
      setSubmitting(false);
    }
  };

  const bulkEst = calculateBulkEst();

  return (
    <div className="flex flex-col min-h-[calc(100vh-120px)] px-4 pb-28 pt-3 max-w-md mx-auto w-full">
      {/* Header Profile Banner */}
      <div className="flex items-center gap-3 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-3.5 mb-3 backdrop-blur-sm">
        <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0">
          <HandCoins className="w-5 h-5 text-amber-400" />
        </div>
        <div className="flex flex-col flex-1">
          <div className="flex items-center gap-2">
            <span className="font-black text-slate-100 text-sm">Скупщик Авита</span>
            <span className="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-1.5 py-0.5 rounded">
              ТОРГОВЕЦ
            </span>
          </div>
          <p className="text-slate-400 text-xs mt-0.5 leading-snug">
            {activeDeal
              ? 'Идёт торг за предмет. Предложи свою цену!'
              : 'Скупаю никнеймы по штучно и оптом за UD.'}
          </p>
        </div>
      </div>

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

      {/* 1. ACTIVE DEAL: INTERACTIVE RPG DIALOGUE MODE */}
      {activeDeal && activeDeal.item ? (
        <div className="flex flex-col gap-3 bg-slate-900/70 border border-slate-800/80 rounded-3xl p-4 animate-in fade-in zoom-in-95">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
            <div className="flex items-center gap-1.5 text-xs text-amber-400 font-bold">
              <MessageSquare className="w-4 h-4" />
              <span>Диалог переговоров</span>
            </div>
            <button
              onClick={handleCancel}
              disabled={submitting}
              className="text-xs text-slate-400 hover:text-rose-400 transition-colors"
            >
              Отмена
            </button>
          </div>

          {/* Central Nickname Preview (STRICT INVARIANT: Plain Text Only) */}
          <div className="py-2 text-center flex flex-col items-center">
            <PlainTextNickname nickname={activeDeal.item.nickname} size="xl" />
            <div className="flex items-center gap-2 mt-1">
              <RarityBadge rarity={activeDeal.item.rarity} size="sm" />
              <span className="text-slate-500">•</span>
              <span className="font-mono text-xs font-bold text-sky-400">
                {activeDeal.item.score} pts
              </span>
            </div>
          </div>

          {/* Chat Messages Feed */}
          <div className="flex flex-col gap-2.5 max-h-64 overflow-y-auto pr-1 py-1">
            {messages.map((m) => {
              const isPlayer = m.sender === 'player';
              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${isPlayer ? 'items-end' : 'items-start'}`}
                >
                  <div className="text-[10px] text-slate-500 mb-0.5 px-1">
                    {isPlayer ? 'Вы' : 'Авита'} • {m.time}
                  </div>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                      isPlayer
                        ? 'bg-sky-600 text-white rounded-br-none shadow-sm'
                        : 'bg-slate-800/90 text-slate-200 border border-slate-700/60 rounded-bl-none shadow-sm'
                    }`}
                  >
                    {m.text}
                    {m.priceTag && (
                      <div className="mt-1 font-mono font-bold text-amber-300 text-xs">
                        💰 Оценка: {m.priceTag} UD
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Player Reply Action Buttons (Written as speech quotes) */}
          {activeDeal.canBargain ? (
            <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-800/80">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">
                Ваш ответ:
              </div>

              {/* Option 1: Accept */}
              <button
                onClick={() =>
                  handleNegotiate(
                    'ACCEPT',
                    `По рукам, Авита! Забирай за ${activeDeal.initial_price} UD.`
                  )
                }
                disabled={submitting}
                className="w-full text-left py-2.5 px-3 rounded-xl bg-emerald-600/90 hover:bg-emerald-500 text-white font-medium text-xs active:scale-98 transition-all flex items-center justify-between"
              >
                <span>💬 «По рукам, забирай!»</span>
                <span className="font-mono font-black">{activeDeal.initial_price} UD</span>
              </button>

              {/* Option 2: +10% */}
              <button
                onClick={() =>
                  handleNegotiate(
                    'PLUS_10',
                    `Маловато за такой ник! Накинь хотя бы 10% (запрос: ${Math.round(
                      activeDeal.initial_price * 1.1
                    )} UD).`
                  )
                }
                disabled={submitting}
                className="w-full text-left py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 font-medium text-xs active:scale-98 transition-all flex items-center justify-between border border-slate-700/50"
              >
                <span>💬 «Накинь 10%, ник стоящий»</span>
                <span className="font-mono text-sky-400">
                  +{Math.round(activeDeal.initial_price * 0.1)} UD
                </span>
              </button>

              {/* Option 3: +125 UD */}
              <button
                onClick={() =>
                  handleNegotiate(
                    'PLUS_125',
                    `Слушай, накинь 125 UD чисто на чай (${activeDeal.initial_price + 125} UD), и договорились.`
                  )
                }
                disabled={submitting}
                className="w-full text-left py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 font-medium text-xs active:scale-98 transition-all flex items-center justify-between border border-slate-700/50"
              >
                <span>💬 «Добавь 125 UD на чай»</span>
                <span className="font-mono text-sky-400">+125 UD</span>
              </button>

              {/* Option 4: +50% */}
              <button
                onClick={() =>
                  handleNegotiate(
                    'PLUS_50',
                    `Ты шутишь? Этот ник редкий и стоит на 50% дороже (${Math.round(
                      activeDeal.initial_price * 1.5
                    )} UD)!`
                  )
                }
                disabled={submitting}
                className="w-full text-left py-2.5 px-3 rounded-xl bg-amber-600/80 hover:bg-amber-500 text-white font-medium text-xs active:scale-98 transition-all flex items-center justify-between"
              >
                <span>💬 «Требую +50% к цене!»</span>
                <span className="font-mono font-bold">
                  +{Math.round(activeDeal.initial_price * 0.5)} UD
                </span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 pt-2 border-t border-slate-800/80">
              <button
                onClick={handleAcceptOffered}
                disabled={submitting}
                className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs active:scale-95 transition-all flex items-center justify-between"
              >
                <span>💬 «Договорились, забираю монеты»</span>
                <span className="font-mono text-sm">
                  +{activeDeal.final_price || activeDeal.initial_price} UD
                </span>
              </button>
              <button
                onClick={handleCancel}
                disabled={submitting}
                className="text-center py-2 text-xs text-slate-400 hover:text-slate-200 font-medium"
              >
                Отказаться и уйти
              </button>
            </div>
          )}
        </div>
      ) : (
        /* 2. COLLECTION LIST WITH BULK ACTIONS */
        <div className="flex flex-col">
          {/* Controls Bar: Multi-select tools */}
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Никнеймы для продажи ({eligibleItems.length})
            </h3>

            {eligibleItems.length > 0 && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleSelectAll}
                  className="text-[11px] font-semibold text-sky-400 hover:text-sky-300 transition-colors"
                >
                  {selectedIds.size === eligibleItems.length ? 'Снять всё' : 'Выбрать всё'}
                </button>
              </div>
            )}
          </div>

          {/* Quick Rarity Filters */}
          {eligibleItems.length > 0 && (
            <div className="flex items-center gap-1.5 mb-3 overflow-x-auto pb-1 text-[11px]">
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
          )}

          {eligibleItems.length === 0 ? (
            <div className="text-center py-12 bg-slate-900/30 rounded-2xl border border-slate-800/40 p-4">
              <p className="text-slate-400 text-xs font-medium">
                Нет доступных никнеймов для продажи.
              </p>
              <p className="text-slate-500 text-[11px] mt-1">
                Никнеймы в избранном или выставленные на витрине защищены.
              </p>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-slate-800/60">
              {eligibleItems.map((item) => {
                const isSelected = selectedIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => handleStartQuote(item.id)}
                    className={`py-3 flex items-center justify-between cursor-pointer group active:opacity-75 transition-colors rounded-xl px-2 ${
                      isSelected ? 'bg-sky-950/20' : 'hover:bg-slate-900/40'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      {/* Checkbox for bulk selection */}
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

                      <div className="flex flex-col">
                        {/* STRICT UI-INVARIANT: Clean Plain Text Nickname */}
                        <PlainTextNickname nickname={item.nickname} size="md" />
                        <div className="flex items-center gap-2 mt-0.5">
                          <RarityBadge rarity={item.rarity} size="sm" />
                          <span className="font-mono text-xs text-sky-400">
                            {item.score} pts
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartQuote(item.id);
                      }}
                      className="flex items-center gap-1 text-xs font-bold text-amber-400 group-hover:translate-x-1 transition-transform pl-2"
                    >
                      Оценить <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* STICKY BULK ACTION BAR */}
      {selectedIds.size > 0 && !activeDeal && (
        <div className="fixed bottom-16 left-0 right-0 max-w-md mx-auto px-4 z-40">
          <div className="bg-slate-900 border border-sky-500/40 rounded-2xl p-3 shadow-2xl flex items-center justify-between backdrop-blur-md animate-in slide-in-from-bottom-3">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-200">
                Выбрано: <span className="text-sky-400">{bulkEst.count}</span> шт.
              </span>
              <span className="text-[11px] text-amber-300 font-mono font-medium">
                ~{bulkEst.finalTotal} UD {bulkEst.bonusPct > 0 && `(+${bulkEst.bonusPct}% опт)`}
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
              <span>Продать оптом</span>
            </button>
          </div>
        </div>
      )}

      {/* BULK SELL DIALOGUE CONFIRMATION MODAL */}
      {bulkModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 max-w-sm w-full shadow-2xl flex flex-col gap-3">
            <div className="flex items-center gap-2 text-amber-400 font-black text-sm">
              <Layers className="w-4 h-4" />
              <span>Оптовая сделка с Авитой</span>
            </div>

            {/* Visual Novel dialogue speech */}
            <div className="bg-slate-800/70 border border-slate-700/60 rounded-2xl p-3.5 text-xs text-slate-200 leading-relaxed">
              <span className="font-bold text-amber-300 block mb-1">Авита говорит:</span>
              «Ого, оптовая поставка на <span className="font-bold text-sky-300">{bulkEst.count}</span> никнеймов!
              {bulkEst.bonusPct > 0
                ? ` За партию от ${bulkEst.bonusPct >= 10 ? '10' : '5'} штук накинул оптовый бонус +${bulkEst.bonusPct}%! `
                : ' '}
              Забираю всю пачку разом за <span className="font-mono font-bold text-amber-400 text-sm">{bulkEst.finalTotal} UD</span>. Ударим по рукам?»
            </div>

            <div className="flex flex-col gap-1.5 mt-2">
              <button
                onClick={handleExecuteBulkSell}
                disabled={submitting}
                className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
              >
                <span>💬 «По рукам! Продать всё оптом»</span>
              </button>
              <button
                onClick={() => setBulkModalOpen(false)}
                disabled={submitting}
                className="w-full py-2.5 text-center text-xs text-slate-400 hover:text-slate-200 font-medium"
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
