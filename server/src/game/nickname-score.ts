export type RarityTier = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'MYTHIC';

const RARITY_MAP: Record<string, RarityTier> = {
  common: 'COMMON',
  uncommon: 'UNCOMMON',
  rare: 'RARE',
  epic: 'EPIC',
  legendary: 'LEGENDARY',
  mythic: 'MYTHIC',
};

const TRAIT_WEIGHTS: Record<string, number> = {
  Genesis: 400,
  Symmetrical: 250,
  'Number-God': 200,
  Shorty: 200,
};

export function calculateLengthScore(cleanNick: string): number {
  const len = cleanNick.length;
  if (len === 0) return 0;
  if (len === 1) return 1000;
  if (len === 2) return 950;
  if (len === 3) return 900;
  if (len === 4) return 800;
  if (len === 5) return 700;
  if (len >= 6 && len <= 7) return 600;
  if (len >= 8 && len <= 10) return 450;
  return 300; // 11+
}

export function calculateRarityScore(rarity: string): number {
  const normalized = (rarity || '').toUpperCase();
  switch (normalized) {
    case 'MYTHIC':
      return 1000;
    case 'LEGENDARY':
      return 850;
    case 'EPIC':
      return 650;
    case 'RARE':
      return 450;
    case 'UNCOMMON':
      return 250;
    case 'COMMON':
    default:
      return 100;
  }
}

export function isConsonant(char: string): boolean {
  return /^[bcdfghjklmnpqrstvwxyz]$/i.test(char);
}

export function isVowel(char: string): boolean {
  return /^[aeiou]$/i.test(char);
}

export function calculateMemorabilityScore(
  cleanNick: string,
  isDictionaryWord: boolean = false
): number {
  if (isDictionaryWord) return 1000;

  const lower = cleanNick.toLowerCase();

  // Beautiful numeric codes (all digits: 777, 2020, 1337, etc.)
  if (/^\d+$/.test(lower)) {
    if (/^(\d)\1+$/.test(lower) || /^(2020|1337|404|777|999|888|100|007)$/.test(lower)) {
      return 700;
    }
    return 600;
  }

  // Phonetically euphonious (CVCV, VCVC, CVCVCV, etc.)
  if (/^[a-z]+$/i.test(lower) && lower.length >= 4) {
    let isAlternating = true;
    for (let i = 0; i < lower.length - 1; i++) {
      const currVowel = isVowel(lower[i]);
      const nextVowel = isVowel(lower[i + 1]);
      if (currVowel === nextVowel) {
        isAlternating = false;
        break;
      }
    }
    if (isAlternating) return 750;
  }

  // Readable alphanumeric / leetspeak (v1p, k0d, etc.)
  if (/^[a-z0-9]+$/i.test(lower) && /[0-9]/.test(lower) && /[a-z]/i.test(lower)) {
    // Hard to pronounce combinations: multiple rare/harsh consonants with numbers (z9q, q7x)
    if (/[xzq][0-9][xzq]|[xzq]{2}/i.test(lower) || !/[aeiouy013457]/i.test(lower)) {
      return 250;
    }
    // Recognizable leet replacements (0->o, 1->i, 3->e, 4->a, 5->s, 7->t)
    const normalizedLeet = lower
      .replace(/0/g, 'o')
      .replace(/1/g, 'i')
      .replace(/3/g, 'e')
      .replace(/4/g, 'a')
      .replace(/5/g, 's')
      .replace(/7/g, 't');

    if (/[aeiouy]/i.test(normalizedLeet)) {
      return 500;
    }
  }

  // Hard to pronounce combination
  return 250;
}

export function calculatePatternScore(cleanNick: string): number {
  const lower = cleanNick.toLowerCase();
  const len = lower.length;
  if (len === 0) return 150;

  // Mono-symbol (aaa, xxxx, 777)
  const isMono = new Set(lower.split('')).size === 1;
  if (isMono && len > 1) return 1000;

  // Palindrome / mirror (xox, aba, 707)
  const reversed = lower.split('').reverse().join('');
  if (len >= 3 && lower === reversed) return 850;

  // Arithmetic ladder (123, 789, abc, cba, 321) - strictly all digits or all letters
  if (len >= 3 && (/^\d+$/.test(lower) || /^[a-z]+$/i.test(lower))) {
    let isLadderAsc = true;
    let isLadderDesc = true;
    for (let i = 0; i < len - 1; i++) {
      const diff = lower.charCodeAt(i + 1) - lower.charCodeAt(i);
      if (diff !== 1) isLadderAsc = false;
      if (diff !== -1) isLadderDesc = false;
    }
    if (isLadderAsc || isLadderDesc) return 750;
  }

  // Alternating pattern (abab, xyxy, x0x0)
  // Must strictly alternate between 2 unique characters across the ENTIRE string
  const uniqueChars = new Set(lower.split(''));
  if (len >= 4 && uniqueChars.size === 2) {
    const isAlternating = lower
      .split('')
      .every((char, idx) => char === (idx % 2 === 0 ? lower[0] : lower[1]));
    if (isAlternating) {
      return 600;
    }
  }

  return 150;
}

export function calculateUniquenessScore(cleanNick: string): number {
  const lower = cleanNick.toLowerCase();
  const uniqueChars = new Set(lower.split(''));

  if (uniqueChars.size === 1) return 1000;
  if (uniqueChars.size === 2) return 700;

  const rareMatch = lower.match(/[xzqv]/g);
  if (rareMatch && rareMatch.length > 0) {
    const score = 350 + rareMatch.length * 200;
    return Math.min(1000, score);
  }

  return 350;
}

export function calculateTraitsScore(traits: string[] = []): number {
  if (!traits || traits.length === 0) return 100;
  let sum = 0;
  for (const t of traits) {
    sum += TRAIT_WEIGHTS[t] || 50;
  }
  return Math.min(1000, Math.max(100, sum));
}

export interface NicknameScoreBreakdown {
  L: number;
  R: number;
  M: number;
  P: number;
  U: number;
  T: number;
  totalScore: number;
}

export function calculateNicknameScore(
  nickname: string,
  rarity: string,
  traits: string[] = [],
  isDictionaryWord: boolean = false
): NicknameScoreBreakdown {
  const cleanNick = nickname.replace(/^@/, '');

  const L = calculateLengthScore(cleanNick);
  const R = calculateRarityScore(rarity);
  const M = calculateMemorabilityScore(cleanNick, isDictionaryWord);
  const P = calculatePatternScore(cleanNick);
  const U = calculateUniquenessScore(cleanNick);
  const T = calculateTraitsScore(traits);

  const rawScore = 0.20 * L + 0.25 * R + 0.20 * M + 0.15 * P + 0.10 * U + 0.10 * T;
  const rounded = Math.round(rawScore);
  const totalScore = Math.min(1000, Math.max(100, rounded));

  return { L, R, M, P, U, T, totalScore };
}
