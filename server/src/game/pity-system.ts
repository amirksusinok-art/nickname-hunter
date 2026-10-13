import { RarityTier } from './nickname-score.js';

export interface RarityProbabilities {
  COMMON: number;
  UNCOMMON: number;
  RARE: number;
  EPIC: number;
  LEGENDARY: number;
  MYTHIC: number;
}

export function calculateProbabilities(pityCounter: number): RarityProbabilities {
  const n = Math.max(0, pityCounter);

  if (n >= 100) {
    // Hard Pity: 100% Epic+
    const epicPlus = 1.0;
    return {
      COMMON: 0,
      UNCOMMON: 0,
      RARE: 0,
      EPIC: epicPlus * (5.5 / 7.0),
      LEGENDARY: epicPlus * (1.3 / 7.0),
      MYTHIC: epicPlus * (0.2 / 7.0),
    };
  }

  let pEpicPlus: number;
  if (n < 10) {
    pEpicPlus = 0.07; // 7.0%
  } else {
    // Soft pity: min(20%, 7% + 0.5% * (n - 9))
    pEpicPlus = Math.min(0.20, 0.07 + 0.005 * (n - 9));
  }

  const pLower = 1.0 - pEpicPlus;

  return {
    COMMON: pLower * (55.0 / 93.0),
    UNCOMMON: pLower * (25.0 / 93.0),
    RARE: pLower * (13.0 / 93.0),
    EPIC: pEpicPlus * (5.5 / 7.0),
    LEGENDARY: pEpicPlus * (1.3 / 7.0),
    MYTHIC: pEpicPlus * (0.2 / 7.0),
  };
}

export function rollRarity(pityCounter: number, randomFloat: number = Math.random()): {
  rarity: RarityTier;
  nextPityCounter: number;
} {
  const probs = calculateProbabilities(pityCounter);
  const tiers: RarityTier[] = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];

  let accumulated = 0;
  let selectedRarity: RarityTier = 'COMMON';

  for (const tier of tiers) {
    accumulated += probs[tier];
    if (randomFloat <= accumulated) {
      selectedRarity = tier;
      break;
    }
  }

  // If floating point slight overflow, fallback to last non-zero
  if (!selectedRarity) {
    selectedRarity = 'COMMON';
  }

  const isEpicPlus = ['EPIC', 'LEGENDARY', 'MYTHIC'].includes(selectedRarity);
  const nextPityCounter = isEpicPlus ? 0 : pityCounter + 1;

  return {
    rarity: selectedRarity,
    nextPityCounter,
  };
}
