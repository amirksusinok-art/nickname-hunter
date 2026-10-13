import { describe, it, expect } from 'vitest';
import {
  calculateInitialPrice,
  calculateDelta,
  calculateAcceptanceProbability,
  calculateCounterPrice,
  evaluateBargain,
  BASE_PRICES,
} from '../game/avita-engine.js';

describe('Avita Negotiation Engine', () => {
  it('calculates initial price based on rarity, score, and traits', () => {
    // Common base = 100, score = 500, traits = 0
    // multiplier = (0.75 + 0.50 * 0.5) * (1 + 0) = 1.0 * 1 = 1.0 -> 100
    const price = calculateInitialPrice('COMMON', 500, 0);
    expect(price).toBe(100);

    // Mythic base = 12000, score = 1000, traits = 5
    // multiplier = (0.75 + 0.50 * 1.0) * (1 + 0.15) = 1.25 * 1.15 = 1.4375 -> 17250
    const mythicPrice = calculateInitialPrice('MYTHIC', 1000, 5);
    expect(mythicPrice).toBe(17250);
  });

  it('calculates bargaining deltas correctly', () => {
    const P = 1000;
    expect(calculateDelta(P, 'ACCEPT')).toBe(0);
    expect(calculateDelta(P, 'PLUS_10')).toBe(100);
    expect(calculateDelta(P, 'PLUS_125')).toBe(125);
    expect(calculateDelta(P, 'PLUS_50')).toBe(500);
    expect(calculateDelta(P, 'CUSTOM', 1350)).toBe(350);
    expect(calculateDelta(P, 'CUSTOM', 900)).toBe(0);
  });

  it('calculates acceptance probability with round penalties clamped in [0.02, 0.85]', () => {
    // Round 1 (k = 1): r = 0.10 -> 0.90 - 1.10 * 0.10 = 0.79
    expect(calculateAcceptanceProbability(1000, 100, 1)).toBeCloseTo(0.79, 2);

    // Round 1 (k = 1): r = 0.125 -> 0.90 - 1.10 * 0.125 = 0.7625
    expect(calculateAcceptanceProbability(1000, 125, 1)).toBeCloseTo(0.7625, 4);

    // Round 1 (k = 1): r = 0.50 -> 0.90 - 0.55 = 0.35
    expect(calculateAcceptanceProbability(1000, 500, 1)).toBeCloseTo(0.35, 2);

    // Round 2 (k = 2): r = 0.50 -> 0.90 - 0.55 - 0.10 = 0.25
    expect(calculateAcceptanceProbability(1000, 500, 2)).toBeCloseTo(0.25, 2);

    // Round 3 (k = 3): r = 0.50 -> 0.90 - 0.55 - 0.20 = 0.15
    expect(calculateAcceptanceProbability(1000, 500, 3)).toBeCloseTo(0.15, 2);

    // Large delta (r >= 0.80) -> clamped to 0.02
    expect(calculateAcceptanceProbability(100, 500, 1)).toBe(0.02);

    // Small delta -> clamped to 0.85
    expect(calculateAcceptanceProbability(1000, 10, 1)).toBe(0.85);
  });

  it('triggers outrage when customPrice exceeds 2.5 * P_base', () => {
    // Base 1000, requesting 2600 (> 2500)
    const outrage = evaluateBargain(1000, 'CUSTOM', { k: 1, customPrice: 2600 });
    expect(outrage.isOutrage).toBe(true);
    expect(outrage.isAccepted).toBe(false);
    expect(outrage.isCompromise).toBe(false);
    expect(outrage.finalPrice).toBe(1000);
    expect(outrage.message).toBe('Ты надо мной издеваешься?! Назови нормальную цену!');
  });

  it('evaluates bargain acceptance, counter-offer, and flat reject states', () => {
    // 1. Acceptance
    const accepted = evaluateBargain(1000, 'PLUS_10', { k: 1, randomFloat: 0.1 });
    expect(accepted.isAccepted).toBe(true);
    expect(accepted.finalPrice).toBe(1100);

    // 2. Counter-offer in round 1: P_counter = round(1000 + 100 * 0.35 * 1) = 1035
    const compromiseR1 = evaluateBargain(1000, 'PLUS_10', {
      k: 1,
      randomFloat: 0.99,
      counterFloat: 0.1,
    });
    expect(compromiseR1.isAccepted).toBe(false);
    expect(compromiseR1.isCompromise).toBe(true);
    expect(compromiseR1.finalPrice).toBe(1035);

    // Counter-offer in round 2: P_counter = round(1000 + 300 * 0.35 * (2/3)) = 1000 + 70 = 1070
    const compromiseR2 = evaluateBargain(1000, 'CUSTOM', {
      k: 2,
      customPrice: 1300,
      randomFloat: 0.99,
      counterFloat: 0.1,
    });
    expect(compromiseR2.isCompromise).toBe(true);
    expect(compromiseR2.finalPrice).toBe(1070);

    // 3. Flat rejection when counterFloat misses
    const flatReject = evaluateBargain(1000, 'PLUS_10', {
      k: 1,
      randomFloat: 0.99,
      counterFloat: 0.99,
    });
    expect(flatReject.isAccepted).toBe(false);
    expect(flatReject.isCompromise).toBe(false);
    expect(flatReject.finalPrice).toBe(1000);
    expect(flatReject.message).toContain('ни монетой больше');
  });

  it('verifies round progression penalty and counter-offer price formulas for attempts 1, 2, 3', () => {
    const P_base = 2000;
    const delta = 400; // r = 400/2000 = 0.20

    // Round 1:
    // P_accept = 0.90 - 1.10*0.20 - 0 = 0.90 - 0.22 = 0.68
    expect(calculateAcceptanceProbability(P_base, delta, 1)).toBeCloseTo(0.68, 2);
    // P_counter_1 = round(2000 + 400 * 0.35 * 1) = 2000 + 140 = 2140
    expect(calculateCounterPrice(P_base, delta, 1)).toBe(2140);

    // Round 2:
    // P_accept = 0.90 - 0.22 - 0.10 = 0.58
    expect(calculateAcceptanceProbability(P_base, delta, 2)).toBeCloseTo(0.58, 2);
    // P_counter_2 = round(2000 + 400 * 0.35 * (2/3)) = 2000 + 93 = 2093
    expect(calculateCounterPrice(P_base, delta, 2)).toBe(2093);

    // Round 3:
    // P_accept = 0.90 - 0.22 - 0.20 = 0.48
    expect(calculateAcceptanceProbability(P_base, delta, 3)).toBeCloseTo(0.48, 2);
    // P_counter_3 = round(2000 + 400 * 0.35 * (1/3)) = 2000 + 47 = 2047
    expect(calculateCounterPrice(P_base, delta, 3)).toBe(2047);
  });

  it('handles boundary conditions: exact 2.5x basePrice does not outrage, > 2.5x does', () => {
    // 2500 is exactly 2.5 * 1000 -> NOT outrage (> 2.5 is false)
    const exactBoundary = evaluateBargain(1000, 'CUSTOM', { k: 1, customPrice: 2500, randomFloat: 0.01 });
    expect(exactBoundary.isOutrage).toBe(false);
    expect(exactBoundary.isAccepted).toBe(true);
    expect(exactBoundary.finalPrice).toBe(2500);

    // 2501 is > 2.5 * 1000 -> OUTRAGE
    const aboveBoundary = evaluateBargain(1000, 'CUSTOM', { k: 1, customPrice: 2501 });
    expect(aboveBoundary.isOutrage).toBe(true);
    expect(aboveBoundary.finalPrice).toBe(1000);
  });

  it('rejects customPrice less than or equal to basePrice', () => {
    const lowerPrice = evaluateBargain(1000, 'CUSTOM', { k: 1, customPrice: 800 });
    expect(lowerPrice.isAccepted).toBe(false);
    expect(lowerPrice.finalPrice).toBe(1000);
    expect(lowerPrice.message).toContain('выше текущей');

    const equalPrice = evaluateBargain(1000, 'CUSTOM', { k: 1, customPrice: 1000 });
    expect(equalPrice.isAccepted).toBe(false);
    expect(equalPrice.finalPrice).toBe(1000);
  });

  it('supports legacy positional arguments correctly', () => {
    // k = 2, randomFloat = 0.01 -> accepted
    const res = evaluateBargain(1000, 'PLUS_10', 2, 0.01, 0.5);
    expect(res.attemptCount).toBe(2);
    expect(res.isAccepted).toBe(true);
  });
});
