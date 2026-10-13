import { describe, it, expect } from 'vitest';
import {
  calculateInitialPrice,
  calculateDelta,
  calculateAcceptanceProbability,
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
  });

  it('calculates acceptance probability clamped in [0.05, 0.85]', () => {
    // delta = 100, P = 1000 -> 0.90 - 1.00 * (0.10) = 0.80
    expect(calculateAcceptanceProbability(1000, 100)).toBeCloseTo(0.80, 2);

    // delta = 500, P = 1000 -> 0.90 - 0.50 = 0.40
    expect(calculateAcceptanceProbability(1000, 500)).toBeCloseTo(0.40, 2);

    // Large delta -> clamped to 0.05
    expect(calculateAcceptanceProbability(100, 500)).toBe(0.05);

    // Small delta -> clamped to 0.85
    expect(calculateAcceptanceProbability(1000, 10)).toBe(0.85);
  });

  it('evaluates bargain acceptance and compromise states', () => {
    // When random float <= prob, accepted
    const accepted = evaluateBargain(1000, 'PLUS_10', 0.1, 0.5);
    expect(accepted.isAccepted).toBe(true);
    expect(accepted.finalPrice).toBe(1100);

    // When rejected and rejectionFloat < 0.4, offers compromise price
    // delta = 100, compPrice = round(1000 + 0.4 * 100) = 1040
    const compromise = evaluateBargain(1000, 'PLUS_10', 0.95, 0.2);
    expect(compromise.isAccepted).toBe(false);
    expect(compromise.isCompromise).toBe(true);
    expect(compromise.finalPrice).toBe(1040);

    // When rejected and rejectionFloat >= 0.4, stays at initial price
    const flatReject = evaluateBargain(1000, 'PLUS_10', 0.95, 0.8);
    expect(flatReject.isAccepted).toBe(false);
    expect(flatReject.isCompromise).toBe(false);
    expect(flatReject.finalPrice).toBe(1000);
  });
});
