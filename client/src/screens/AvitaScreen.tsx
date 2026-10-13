import React, { useState, useEffect } from 'react';
import { HandCoins, ArrowRight, ShieldCheck, Check, X, AlertTriangle } from 'lucide-react';
import { api, AvitaDeal, NicknameItem } from '../api/client.js';
import { PlainTextNickname } from '../components/PlainTextNickname.js';
import { RarityBadge } from '../components/RarityBadge.js';
import { haptic } from '../telegram/telegram-sdk.js';

interface AvitaScreenProps {
  preselectedItemId: string | null;
  onClearPreselectedItem: () => void;
  onBalanceChange: (newBalance: number) => void;
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
  const [avitaDialogue, setAvitaDialogue] = useState<string>(
    'Привет, охотник! Принёс что-нибудь стоящее? Давай посмотрим, сколько это может стоить.'
  );
  const [dealOutcome, setDealOutcome] = useState<{
    status: string;
    message: string;
    finalPrice?: number;
  } | null>(null);

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
        if (dealRes.activeDeal.final_price) {
          setAvitaDialogue(`Мое последнее предложение: ${dealRes.activeDeal.final_price} UD. Берешь или уходишь?`);
        } else {
          setAvitaDialogue(`За этот ник могу предложить ${dealRes.activeDeal.initial_price} UD. Будем договариваться?`);
        }
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

  const handleStartQuote = async (itemId: string) => {
    setSubmitting(true);
    setDealOutcome(null);
    haptic.impact('medium');

    try {
      const res = await api.createQuote(itemId);
      setActiveDeal(res.deal);
      setAvitaDialogue(
        `Хм, ник неплохой. Моя стартовая цена: ${res.deal.initial_price} UD. Что скажешь?`
      );
      onClearPreselectedItem();
    } catch (err: any) {
      setAvitaDialogue(`Не могу оценить этот никнейм: ${err.message}`);
      haptic.notification('error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNegotiate = async (action: string) => {
    if (!activeDeal || submitting) return;
    setSubmitting(true);
    haptic.impact('medium');

    try {
      const res = await api.negotiateDeal(activeDeal.id, action);

      if (res.status === 'ACCEPTED') {
        haptic.notification('success');
        onBalanceChange(res.newBalance!);
        setDealOutcome({
          status: 'ACCEPTED',
          message: res.message,
          finalPrice: res.finalPrice,
        });
        setAvitaDialogue(res.message);
        setActiveDeal(null);
        // Refresh collection
        const updated = await api.getCollection();
        setCollection(updated.items);
      } else {
        // Compromise or flat reject
        setAvitaDialogue(res.message);
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
      setAvitaDialogue(err.message || 'Ошибка переговоров');
      haptic.notification('error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcceptOffered = async () => {
    if (!activeDeal || submitting) return;
    setSubmitting(true);
    haptic.impact('medium');

    try {
      const res = await api.acceptCounterOffer(activeDeal.id);
      haptic.notification('success');
      onBalanceChange(res.newBalance);
      setDealOutcome({
        status: 'ACCEPTED',
        message: res.message,
        finalPrice: res.finalPrice,
      });
      setAvitaDialogue(res.message);
      setActiveDeal(null);
      const updated = await api.getCollection();
      setCollection(updated.items);
    } catch (err: any) {
      setAvitaDialogue(err.message || 'Ошибка завершения сделки');
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
      setDealOutcome(null);
      setAvitaDialogue('Как знаешь, охотник. Приходи, когда надумаешь продать.');
    } catch (err: any) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const eligibleItems = collection.filter((it) => !it.is_favorite && !it.is_showcased);

  return (
    <div className="flex flex-col min-h-[calc(100vh-120px)] px-4 pb-24 pt-4 max-w-md mx-auto w-full">
      {/* Header & Character intro */}
      <div className="flex items-start gap-3 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 mb-4 backdrop-blur-sm">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0">
          <HandCoins className="w-6 h-6 text-amber-400" />
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="font-black text-slate-100 text-sm">Скупщик Авита</span>
            <span className="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-1.5 py-0.5 rounded">
              ТОРГОВЕЦ
            </span>
          </div>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">{avitaDialogue}</p>
        </div>
      </div>

      {dealOutcome && (
        <div className="mb-4 bg-emerald-950/40 border border-emerald-800/60 rounded-2xl p-4 flex flex-col gap-1 text-center">
          <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
            Сделка успешно завершена
          </div>
          <div className="text-lg font-black text-slate-100">
            +{dealOutcome.finalPrice} UD
          </div>
          <div className="text-xs text-slate-400">{dealOutcome.message}</div>
        </div>
      )}

      {/* Active Deal View */}
      {activeDeal && activeDeal.item ? (
        <div className="flex flex-col gap-4 bg-slate-900/40 border border-slate-800/60 rounded-3xl p-5 mb-4">
          <div className="flex flex-col items-center text-center gap-2">
            <div className="text-xs uppercase font-bold text-slate-400 tracking-wider">
              Предмет на оценке
            </div>

            {/* STRICT MANDATORY INVARIANT: Clean Plain Text Nickname */}
            <div className="py-2">
              <PlainTextNickname nickname={activeDeal.item.nickname} size="xl" />
            </div>

            <div className="flex items-center gap-2">
              <RarityBadge rarity={activeDeal.item.rarity} />
              <span className="text-slate-500">•</span>
              <span className="font-mono text-xs font-bold text-sky-400">
                {activeDeal.item.score} pts
              </span>
            </div>
          </div>

          <div className="border-t border-slate-800/80 pt-4 flex flex-col gap-3">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">Стартовое предложение:</span>
              <span className="font-mono font-bold text-slate-100">
                {activeDeal.initial_price} UD
              </span>
            </div>

            {activeDeal.final_price && (
              <div className="flex justify-between items-center text-xs">
                <span className="text-amber-400 font-bold">Текущее предложение Авиты:</span>
                <span className="font-mono font-black text-amber-400 text-sm">
                  {activeDeal.final_price} UD
                </span>
              </div>
            )}

            {/* Negotiation buttons */}
            {activeDeal.canBargain ? (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <button
                  onClick={() => handleNegotiate('ACCEPT')}
                  disabled={submitting}
                  className="py-3 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs active:scale-95 transition-all"
                >
                  Принять {activeDeal.initial_price} UD
                </button>
                <button
                  onClick={() => handleNegotiate('PLUS_10')}
                  disabled={submitting}
                  className="py-3 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs active:scale-95 transition-all"
                >
                  Торг (+10%)
                </button>
                <button
                  onClick={() => handleNegotiate('PLUS_125')}
                  disabled={submitting}
                  className="py-3 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs active:scale-95 transition-all"
                >
                  Торг (+125 UD)
                </button>
                <button
                  onClick={() => handleNegotiate('PLUS_50')}
                  disabled={submitting}
                  className="py-3 px-3 rounded-xl bg-amber-600/80 hover:bg-amber-500 text-white font-bold text-xs active:scale-95 transition-all"
                >
                  Наглеть (+50%)
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 mt-2">
                <button
                  onClick={handleAcceptOffered}
                  disabled={submitting}
                  className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm active:scale-95 transition-all"
                >
                  Забрать {activeDeal.final_price || activeDeal.initial_price} UD
                </button>
                <button
                  onClick={handleCancel}
                  disabled={submitting}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-800 text-slate-400 font-semibold text-xs active:scale-95 transition-all"
                >
                  Отказаться и забрать никнейм
                </button>
              </div>
            )}

            {activeDeal.canBargain && (
              <button
                onClick={handleCancel}
                disabled={submitting}
                className="text-[11px] text-slate-500 hover:text-slate-300 text-center mt-1"
              >
                Отмена сделки
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Pick item from collection */
        <div className="flex flex-col">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
            Выберите никнейм для продажи
          </h3>

          {eligibleItems.length === 0 ? (
            <div className="text-center py-12 bg-slate-900/30 rounded-2xl border border-slate-800/40 p-4">
              <p className="text-slate-400 text-xs font-medium">
                Нет доступных никнеймов для продажи.
              </p>
              <p className="text-slate-500 text-[11px] mt-1">
                Предметы в избранном или на витрине защищены.
              </p>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-slate-800/60">
              {eligibleItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleStartQuote(item.id)}
                  className="py-3 flex items-center justify-between cursor-pointer group active:opacity-75 transition-opacity"
                >
                  <div className="flex flex-col">
                    {/* STRICT UI-INVARIANT: Clean Plain Text Nickname */}
                    <PlainTextNickname nickname={item.nickname} size="md" />
                    <div className="flex items-center gap-2 mt-0.5">
                      <RarityBadge rarity={item.rarity} />
                      <span className="font-mono text-xs text-sky-400">
                        {item.score} pts
                      </span>
                    </div>
                  </div>

                  <button className="flex items-center gap-1 text-xs font-bold text-amber-400 group-hover:translate-x-1 transition-transform">
                    Оценить <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
