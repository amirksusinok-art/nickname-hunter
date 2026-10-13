import { describe, it, expect } from 'vitest';
import {
  calculateLengthScore,
  calculateRarityScore,
  calculateMemorabilityScore,
  calculatePatternScore,
  calculateUniquenessScore,
  calculateTraitsScore,
  calculateNicknameScore,
} from '../game/nickname-score.js';

describe('Nickname Score Deterministic Engine', () => {
  it('calculates length score according to table and handles empty string', () => {
    expect(calculateLengthScore('')).toBe(0);
    expect(calculateLengthScore('x')).toBe(1000);
    expect(calculateLengthScore('ab')).toBe(950);
    expect(calculateLengthScore('neo')).toBe(900);
    expect(calculateLengthScore('apex')).toBe(800);
    expect(calculateLengthScore('ghost')).toBe(700);
    expect(calculateLengthScore('shadow')).toBe(600);
    expect(calculateLengthScore('shadows')).toBe(600);
    expect(calculateLengthScore('cyberpunk')).toBe(450);
    expect(calculateLengthScore('superlongnickname')).toBe(300);
  });

  it('calculates rarity score accurately', () => {
    expect(calculateRarityScore('COMMON')).toBe(100);
    expect(calculateRarityScore('UNCOMMON')).toBe(250);
    expect(calculateRarityScore('RARE')).toBe(450);
    expect(calculateRarityScore('EPIC')).toBe(650);
    expect(calculateRarityScore('LEGENDARY')).toBe(850);
    expect(calculateRarityScore('MYTHIC')).toBe(1000);
  });

  it('calculates memorability score', () => {
    expect(calculateMemorabilityScore('shadow', true)).toBe(1000); // Dictionary
    expect(calculateMemorabilityScore('777', false)).toBe(700); // Numeric code
    expect(calculateMemorabilityScore('2020', false)).toBe(700);
    expect(calculateMemorabilityScore('koko', false)).toBe(750); // CVCV
    expect(calculateMemorabilityScore('v1p', false)).toBe(500); // Leetspeak
    expect(calculateMemorabilityScore('z9q', false)).toBe(250); // Hard to pronounce
  });

  it('calculates symmetry and patterns with strict alternating and ladder bounds', () => {
    expect(calculatePatternScore('aaa')).toBe(1000); // Mono-symbol
    expect(calculatePatternScore('777')).toBe(1000);
    expect(calculatePatternScore('aba')).toBe(850); // Palindrome
    expect(calculatePatternScore('xox')).toBe(850);
    expect(calculatePatternScore('123')).toBe(750); // Ladder asc
    expect(calculatePatternScore('cba')).toBe(750); // Ladder desc
    expect(calculatePatternScore('abab')).toBe(600); // Alternating
    expect(calculatePatternScore('ababc')).toBe(150); // NOT alternating (5 chars, 3 unique)
    expect(calculatePatternScore('89:')).toBe(150); // NOT ladder across punctuation
    expect(calculatePatternScore('random')).toBe(150); // No pattern
  });

  it('calculates character uniqueness', () => {
    expect(calculateUniquenessScore('xxxx')).toBe(1000); // Mono-alphabet
    expect(calculateUniquenessScore('xoxo')).toBe(700); // 2 unique chars
    expect(calculateUniquenessScore('cyber')).toBe(350); // Standard
    expect(calculateUniquenessScore('quantum')).toBe(550); // 1 rare char 'q' -> 350 + 200 = 550
  });

  it('calculates special traits score with 100 minimum floor', () => {
    expect(calculateTraitsScore([])).toBe(100); // No traits
    expect(calculateTraitsScore(['UnknownTrait'])).toBe(100); // Custom/unknown trait never drops below 100
    expect(calculateTraitsScore(['Genesis'])).toBe(400);
    expect(calculateTraitsScore(['Genesis', 'Symmetrical'])).toBe(650);
    expect(calculateTraitsScore(['Genesis', 'Symmetrical', 'Number-God', 'Shorty'])).toBe(1000); // Capped at 1000
  });

  it('calculates combined weighted score bounded in [100, 1000]', () => {
    const mythic = calculateNicknameScore('777', 'MYTHIC', ['Genesis', 'Number-God'], false);
    expect(mythic.totalScore).toBeGreaterThanOrEqual(100);
    expect(mythic.totalScore).toBeLessThanOrEqual(1000);
    expect(mythic.totalScore).toBeGreaterThan(800);

    const common = calculateNicknameScore('darkplayer99', 'COMMON', [], false);
    expect(common.totalScore).toBeGreaterThanOrEqual(100);
    expect(common.totalScore).toBeLessThan(500);
  });
});
