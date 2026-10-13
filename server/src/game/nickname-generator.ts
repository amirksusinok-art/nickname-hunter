import { RarityTier, calculateNicknameScore } from './nickname-score.js';

export interface GeneratedNickname {
  nickname: string;
  rarity: RarityTier;
  score: number;
  traits: string[];
  category: string;
  isDictionaryWord: boolean;
}

const DICTIONARY_WORDS = [
  'apex', 'echo', 'nova', 'zero', 'blade', 'frost', 'titan', 'ghost', 'pulse',
  'nexus', 'vortex', 'oracle', 'shadow', 'matrix', 'falcon', 'sniper', 'zenith',
  'phantom', 'cipher', 'quantum', 'astral', 'hydra', 'lynx', 'storm', 'vector',
  'solaris', 'chronos', 'aurora', 'valkyrie', 'inferno', 'spectre', 'draco',
  'havoc', 'omen', 'blaze', 'rift', 'strike', 'karma', 'clutch', 'glitch'
];

const SHORT_WORDS = [
  'ace', 'neo', 'fox', 'god', 'sky', 'vip', 'pro', 'bot', 'dev', 'fly', 'sun',
  'hex', 'zen', 'arc', 'ion', 'orb', 'max', 'kai', 'ray', 'ash'
];

const NUMERIC_CODES = [
  '777', '888', '999', '1337', '2020', '404', '007', '100', '111', '555',
  '333', '666', '123', '321', '808', '909', '707', '505', '000', '9999'
];

const MONO_SYMBOLS = [
  'xxx', 'aaa', '777', 'zzz', 'qqq', 'vvv', 'ooo', 'xxx', 'fff', 'yyy'
];

const SYMMETRIC_PATTERNS = [
  'xox', 'aba', 'radar', 'level', 'stats', 'noon', '707', '808', '909', 'wow',
  'pop', 'eye', 'kayak', 'rotor', 'madam', 'tenet', 'civic'
];

const LEET_PATTERNS = [
  'v1p', 'k0d', 'b0ss', 'cr3w', 'h4ck', '3l1t3', 'r00t', 'd4rk', 'n30', 'f1r3'
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDigits(count: number): string {
  let res = '';
  for (let i = 0; i < count; i++) {
    res += Math.floor(Math.random() * 10).toString();
  }
  return res;
}

export function generateNicknameForRarity(rarity: RarityTier): GeneratedNickname {
  let nickname = '';
  let category = 'DICTIONARY';
  let isDictionary = false;
  const traits: string[] = [];

  switch (rarity) {
    case 'MYTHIC': {
      const type = Math.random();
      if (type < 0.45) {
        nickname = pickRandom(MONO_SYMBOLS);
        category = 'MONO';
      } else if (type < 0.75) {
        nickname = pickRandom(['777', '888', '999', '007', '1337']);
        category = 'NUMERIC';
      } else {
        nickname = pickRandom(['neo', 'god', 'ace', 'vip', 'zen']);
        category = 'SHORT';
        isDictionary = true;
      }
      traits.push('Genesis');
      break;
    }

    case 'LEGENDARY': {
      const type = Math.random();
      if (type < 0.35) {
        nickname = pickRandom(SYMMETRIC_PATTERNS);
        category = 'SYMMETRIC';
      } else if (type < 0.70) {
        nickname = pickRandom(SHORT_WORDS);
        category = 'SHORT';
        isDictionary = true;
      } else {
        nickname = pickRandom(NUMERIC_CODES);
        category = 'NUMERIC';
      }
      if (Math.random() < 0.5) traits.push('Genesis');
      break;
    }

    case 'EPIC': {
      const type = Math.random();
      if (type < 0.45) {
        nickname = pickRandom(DICTIONARY_WORDS.filter((w) => w.length <= 4));
        category = 'DICTIONARY';
        isDictionary = true;
      } else if (type < 0.75) {
        nickname = pickRandom(LEET_PATTERNS);
        category = 'LEET';
      } else {
        nickname = pickRandom(SYMMETRIC_PATTERNS);
        category = 'SYMMETRIC';
      }
      break;
    }

    case 'RARE': {
      const type = Math.random();
      if (type < 0.6) {
        nickname = pickRandom(DICTIONARY_WORDS);
        category = 'DICTIONARY';
        isDictionary = true;
      } else {
        const word = pickRandom(SHORT_WORDS);
        nickname = `${word}${randomDigits(2)}`;
        category = 'ALPHANUMERIC';
      }
      break;
    }

    case 'UNCOMMON': {
      const word = pickRandom(DICTIONARY_WORDS);
      nickname = `${word}${randomDigits(1)}`;
      category = 'ALPHANUMERIC';
      break;
    }

    case 'COMMON':
    default: {
      const word = pickRandom(DICTIONARY_WORDS);
      nickname = `${word}${randomDigits(2)}`;
      category = 'PROCEDURAL';
      break;
    }
  }

  // Auto-detect and award natural traits
  const clean = nickname.toLowerCase();

  // Shorty trait: length <= 4
  if (clean.length <= 4 && !traits.includes('Shorty')) {
    traits.push('Shorty');
  }

  // Symmetrical trait: palindrome or mirrored
  const reversed = clean.split('').reverse().join('');
  if (clean.length >= 3 && clean === reversed && !traits.includes('Symmetrical')) {
    traits.push('Symmetrical');
  }

  // Number-God trait: beautiful numeric codes
  if (/^\d+$/.test(clean) && !traits.includes('Number-God')) {
    traits.push('Number-God');
  }

  const { totalScore } = calculateNicknameScore(nickname, rarity, traits, isDictionary);

  return {
    nickname,
    rarity,
    score: totalScore,
    traits,
    category,
    isDictionaryWord: isDictionary,
  };
}
