import { RarityTier } from './nickname-score.js';

export const BASE_PRICES: Record<RarityTier, number> = {
  COMMON: 100,
  UNCOMMON: 200,
  RARE: 450,
  EPIC: 1200,
  LEGENDARY: 3500,
  MYTHIC: 12000,
};

export type BargainAction = 'ACCEPT' | 'PLUS_10' | 'PLUS_125' | 'PLUS_50' | 'CUSTOM';

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

export function calculateDelta(
  basePrice: number,
  action: BargainAction,
  customPrice?: number
): number {
  switch (action) {
    case 'PLUS_10':
      return Math.round(0.10 * basePrice);
    case 'PLUS_125':
      return 125;
    case 'PLUS_50':
      return Math.round(0.50 * basePrice);
    case 'CUSTOM':
      return customPrice !== undefined ? Math.max(0, customPrice - basePrice) : 0;
    case 'ACCEPT':
    default:
      return 0;
  }
}

export function calculateAcceptanceProbability(
  basePrice: number,
  delta: number,
  k: number = 1
): number {
  if (basePrice <= 0) return 0.02;
  const r = delta / basePrice;
  // P_accept = clamp(0.90 - 1.10 * r - 0.10 * (k - 1), 0.02, 0.85)
  const rawProb = 0.90 - 1.10 * r - 0.10 * (k - 1);
  return Math.min(0.85, Math.max(0.02, rawProb));
}

export function calculateCounterProbability(
  basePrice: number,
  delta: number,
  k: number = 1
): number {
  if (basePrice <= 0) return 0.10;
  const r = delta / basePrice;
  // P_counter_chance = clamp(0.75 - 0.50 * r - 0.15 * (k - 1), 0.10, 0.75)
  const rawProb = 0.75 - 0.50 * r - 0.15 * (k - 1);
  return Math.min(0.75, Math.max(0.10, rawProb));
}

export function calculateCounterPrice(
  basePrice: number,
  delta: number,
  k: number = 1
): number {
  // P_counter = round( P_base + delta * 0.35 * (1 - (k - 1) / 3) )
  const factor = 0.35 * (1 - (k - 1) / 3);
  return Math.round(basePrice + delta * factor);
}

export interface BargainResult {
  action: BargainAction;
  initialPrice: number;
  requestedPrice: number;
  finalPrice: number;
  isAccepted: boolean;
  isCompromise: boolean;
  isOutrage: boolean;
  attemptCount: number;
  message: string;
}

export interface EvaluateBargainOptions {
  k?: number;
  customPrice?: number;
  randomFloat?: number;
  counterFloat?: number;
}

export function evaluateBargain(
  basePrice: number,
  action: BargainAction,
  optionsOrK?: number | EvaluateBargainOptions,
  customPriceOrRandomFloat?: number,
  randomFloatArg?: number,
  counterFloatArg?: number
): BargainResult {
  let k = 1;
  let customPrice: number | undefined;
  let randomFloat = Math.random();
  let counterFloat = Math.random();

  if (typeof optionsOrK === 'object' && optionsOrK !== null) {
    if (optionsOrK.k !== undefined) k = optionsOrK.k;
    if (optionsOrK.customPrice !== undefined) customPrice = optionsOrK.customPrice;
    if (optionsOrK.randomFloat !== undefined) randomFloat = optionsOrK.randomFloat;
    if (optionsOrK.counterFloat !== undefined) counterFloat = optionsOrK.counterFloat;
  } else if (typeof optionsOrK === 'number') {
    if (optionsOrK < 1) {
      // Legacy signature: (basePrice, action, randomFloat, rejectionFloat)
      randomFloat = optionsOrK;
      if (typeof customPriceOrRandomFloat === 'number') {
        counterFloat = customPriceOrRandomFloat;
      }
      k = 1;
    } else {
      k = Math.max(1, Math.floor(optionsOrK));
      if (action === 'CUSTOM') {
        if (typeof customPriceOrRandomFloat === 'number') customPrice = customPriceOrRandomFloat;
        if (typeof randomFloatArg === 'number') randomFloat = randomFloatArg;
        if (typeof counterFloatArg === 'number') counterFloat = counterFloatArg;
      } else {
        if (typeof customPriceOrRandomFloat === 'number') randomFloat = customPriceOrRandomFloat;
        if (typeof randomFloatArg === 'number') counterFloat = randomFloatArg;
      }
    }
  }

  if (action === 'ACCEPT') {
    return {
      action,
      initialPrice: basePrice,
      requestedPrice: basePrice,
      finalPrice: basePrice,
      isAccepted: true,
      isCompromise: false,
      isOutrage: false,
      attemptCount: k,
      message: 'По рукам! Отличная сделка.',
    };
  }

  if (action === 'CUSTOM' && customPrice !== undefined && customPrice <= basePrice) {
    return {
      action,
      initialPrice: basePrice,
      requestedPrice: customPrice,
      finalPrice: basePrice,
      isAccepted: false,
      isCompromise: false,
      isOutrage: false,
      attemptCount: k,
      message: `Ты просишь ${customPrice} UD, хотя я уже предлагаю ${basePrice} UD! Назови цену выше текущей.`,
    };
  }

  const delta = calculateDelta(basePrice, action, customPrice);
  const targetPrice = customPrice !== undefined && action === 'CUSTOM' ? customPrice : basePrice + delta;

  // 1. Check Outrage: targetPrice > 2.5 * P_base
  if (targetPrice > 2.5 * basePrice) {
    return {
      action,
      initialPrice: basePrice,
      requestedPrice: targetPrice,
      finalPrice: basePrice,
      isAccepted: false,
      isCompromise: false,
      isOutrage: true,
      attemptCount: k,
      message: 'Ты надо мной издеваешься?! Назови нормальную цену!',
    };
  }

  // 2. Acceptance check: P_accept
  const acceptProb = calculateAcceptanceProbability(basePrice, delta, k);
  if (randomFloat <= acceptProb) {
    return {
      action,
      initialPrice: basePrice,
      requestedPrice: targetPrice,
      finalPrice: targetPrice,
      isAccepted: true,
      isCompromise: false,
      isOutrage: false,
      attemptCount: k,
      message: 'Ладно, уговорил! Забираю по твоей цене.',
    };
  }

  // 3. Counter-offer check: P_counter
  const counterProb = calculateCounterProbability(basePrice, delta, k);
  if (counterFloat <= counterProb) {
    const counterPrice = calculateCounterPrice(basePrice, delta, k);
    return {
      action,
      initialPrice: basePrice,
      requestedPrice: targetPrice,
      finalPrice: counterPrice,
      isAccepted: false,
      isCompromise: true,
      isOutrage: false,
      attemptCount: k,
      message:
        k >= 3
          ? `Это моё последнее слово: ${counterPrice} UD. Либо берёшь, либо уходи.`
          : `Столько не дам. Вот мое встречное предложение: ${counterPrice} UD.`,
    };
  }

  // 4. Flat rejection
  return {
    action,
    initialPrice: basePrice,
    requestedPrice: targetPrice,
    finalPrice: basePrice,
    isAccepted: false,
    isCompromise: false,
    isOutrage: false,
    attemptCount: k,
    message:
      k >= 3
        ? `Всё, хватит базарить. Ни монетой больше: ${basePrice} UD. Либо забираешь, либо свободен.`
        : `Нет уж, ни монетой больше. Только ${basePrice} UD.`,
  };
}
