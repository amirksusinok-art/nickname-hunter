import { describe, it, expect } from 'vitest';
import { calculateProbabilities, rollRarity } from '../game/pity-system.js';

describe('Pity and Probability System', () => {
  it('provides base probabilities when counter < 10', () => {
    const probs = calculateProbabilities(5);
    const sum =
      probs.COMMON +
      probs.UNCOMMON +
      probs.RARE +
      probs.EPIC +
      probs.LEGENDARY +
      probs.MYTHIC;

    expect(sum).toBeCloseTo(1.0, 5);
    expect(probs.COMMON).toBeCloseTo(0.55, 3);
    expect(probs.UNCOMMON).toBeCloseTo(0.25, 3);
    expect(probs.RARE).toBeCloseTo(0.13, 3);

    const epicPlus = probs.EPIC + probs.LEGENDARY + probs.MYTHIC;
    expect(epicPlus).toBeCloseTo(0.07, 4);
  });

  it('activates soft pity when counter >= 10 and increases Epic+ chance', () => {
    const probs10 = calculateProbabilities(10);
    const epicPlus10 = probs10.EPIC + probs10.LEGENDARY + probs10.MYTHIC;
    expect(epicPlus10).toBeCloseTo(0.075, 4); // 7% + 0.5% * (10 - 9) = 7.5%

    const probs20 = calculateProbabilities(20);
    const epicPlus20 = probs20.EPIC + probs20.LEGENDARY + probs20.MYTHIC;
    expect(epicPlus20).toBeCloseTo(0.125, 4); // 7% + 0.5% * 11 = 12.5%

    const probs50 = calculateProbabilities(50);
    const epicPlus50 = probs50.EPIC + probs50.LEGENDARY + probs50.MYTHIC;
    expect(epicPlus50).toBeCloseTo(0.20, 4); // Capped at 20%
  });

  it('guarantees 100% Epic+ when counter reaches 100 (Hard Pity)', () => {
    const probs = calculateProbabilities(100);
    expect(probs.COMMON).toBe(0);
    expect(probs.UNCOMMON).toBe(0);
    expect(probs.RARE).toBe(0);

    const epicPlus = probs.EPIC + probs.LEGENDARY + probs.MYTHIC;
    expect(epicPlus).toBeCloseTo(1.0, 5);

    const rolled = rollRarity(100, 0.5);
    expect(['EPIC', 'LEGENDARY', 'MYTHIC']).toContain(rolled.rarity);
    expect(rolled.nextPityCounter).toBe(0); // Resets pity
  });

  it('increments pity on lower drops and resets on Epic+', () => {
    const rollLow = rollRarity(5, 0.1); // Will land in COMMON
    expect(rollLow.rarity).toBe('COMMON');
    expect(rollLow.nextPityCounter).toBe(6);

    const rollEpic = rollRarity(5, 0.999); // Will land in MYTHIC/LEGENDARY/EPIC
    expect(['EPIC', 'LEGENDARY', 'MYTHIC']).toContain(rollEpic.rarity);
    expect(rollEpic.nextPityCounter).toBe(0);
  });
});
