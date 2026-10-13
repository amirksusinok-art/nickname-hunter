import { RarityTier } from './nickname-score.js';

export const BASE_PRICES: Record<RarityTier, number> = {
  COMMON: 100,
  UNCOMMON: 200,
  RARE: 450,
  EPIC: 1200,
  LEGENDARY: 3500,
  MYTHIC: 12000,
};

export type BargainAction = 'ACCEPT' | 'PLUS_10' | 'PLUS_125' | 'PLUS_50';

export function calculateInitialPrice(
  rarity: string,
  score: number,
  traitsCount: number = 0
): number {
  const normRarity = (rarity || 'COMMON').toUpperCase() as RarityTier;
  const B = BASE_PRICES[normRarity] || 100;
  const S = Math.min(1000, Math.max(100, score));
  const K = Math.min(5, Math.max(0, traitsCount));

  // P = round( B * (0.75 + 0.50 * (S / 1000)) * (1 + min(0.15, 0.03 * K)) )
  const multiplier = (0.75 + 0.50 * (S / 1000)) * (1 + Math.min(0.15, 0.03 * K));
  return Math.round(B * multiplier);
}

export function calculateDelta(initialPrice: number, action: BargainAction): number {
  switch (action) {
    case 'PLUS_10':
      return Math.round(0.10 * initialPrice);
    case 'PLUS_125':
      return 125;
    case 'PLUS_50':
      return Math.round(0.50 * initialPrice);
    case 'ACCEPT':
    default:
      return 0;
  }
}

export function calculateAcceptanceProbability(initialPrice: number, delta: number): number {
  if (initialPrice <= 0) return 0.05;
  const rawProb = 0.90 - 1.00 * (delta / initialPrice);
  return Math.min(0.85, Math.max(0.05, rawProb));
}

export interface BargainResult {
  action: BargainAction;
  initialPrice: number;
  requestedPrice: number;
  finalPrice: number;
  isAccepted: boolean;
  isCompromise: boolean;
  message: string;
}

export function evaluateBargain(
  initialPrice: number,
  action: BargainAction,
  randomFloat: number = Math.random(),
  rejectionFloat: number = Math.random()
): BargainResult {
  if (action === 'ACCEPT') {
    return {
      action,
      initialPrice,
      requestedPrice: initialPrice,
      finalPrice: initialPrice,
      isAccepted: true,
      isCompromise: false,
      message: 'По рукам! Отличная сделка.',
    };
  }

  const delta = calculateDelta(initialPrice, action);
  const requestedPrice = initialPrice + delta;
  const prob = calculateAcceptanceProbability(initialPrice, delta);

  if (randomFloat <= prob) {
    return {
      action,
      initialPrice,
      requestedPrice,
      finalPrice: requestedPrice,
      isAccepted: true,
      isCompromise: false,
      message: 'Ладно, уговорил! Забираю по твоей цене.',
    };
  }

  // Rejected: 60% initial price, 40% compromise price
  if (rejectionFloat < 0.40) {
    const compPrice = Math.round(initialPrice + 0.40 * delta);
    return {
      action,
      initialPrice,
      requestedPrice,
      finalPrice: compPrice,
      isAccepted: false,
      isCompromise: true,
      message: `Столько не дам. Вот мое последнее слово: ${compPrice} UD.`,
    };
  }

  return {
    action,
    initialPrice,
    requestedPrice,
    finalPrice: initialPrice,
    isAccepted: false,
    isCompromise: false,
    message: `Нет уж, ни монетой больше. Только ${initialPrice} UD.`,
  };
}
