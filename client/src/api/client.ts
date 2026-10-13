import { getAuthHeader } from '../telegram/telegram-sdk.js';

export interface UserProfile {
  id: string;
  telegram_id: number;
  username: string | null;
  balance_ud: number;
  level: number;
  xp: number;
  privacy_hide_balance: boolean;
}

export interface UserStats {
  pity_counter: number;
  total_drops: number;
  best_score: number;
  best_nickname: string | null;
  best_rarity: string | null;
}

export interface NicknameItem {
  id: string;
  owner_id: string | null;
  nickname: string;
  rarity: 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'MYTHIC';
  score: number;
  traits: string[];
  is_favorite: boolean;
  is_locked: boolean;
  is_showcased?: boolean;
  dropped_at: string;
}

export interface ScoreBreakdown {
  L: number;
  R: number;
  M: number;
  P: number;
  U: number;
  T: number;
  totalScore: number;
}

export interface RollResult {
  item: NicknameItem;
  newBalance: number;
  newPityCounter: number;
  scoreBreakdown: ScoreBreakdown;
  levelUp?: boolean;
  newLevel?: number;
  isIdempotentReplay?: boolean;
}

export interface AvitaDeal {
  id: string;
  user_id: string;
  item_id: string;
  initial_price: number;
  action_type: string | null;
  requested_price: number | null;
  final_price: number | null;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
  item?: NicknameItem;
  canBargain?: boolean;
  options?: Array<{ action: string; label: string; delta: number }>;
}

export interface LeaderboardEntry {
  rank: number;
  isMe: boolean;
  userId: string;
  username: string;
  level: number;
  balance: number | string;
  isBalanceHidden: boolean;
  item: {
    id: string;
    nickname: string;
    rarity: string;
    score: number;
    traits: string[];
    droppedAt: string;
  };
}

const API_BASE = '/api';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', getAuthHeader());
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data as T;
}

export const api = {
  getMe: () => request<{ user: UserProfile; stats: UserStats }>('/user/me'),
  updateSettings: (settings: { privacy_hide_balance: boolean }) =>
    request<{ success: boolean; privacy_hide_balance: boolean }>('/user/settings', {
      method: 'PATCH',
      body: JSON.stringify(settings),
    }),

  rollDrop: (idempotencyKey?: string) => {
    const headers: Record<string, string> = {};
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }
    return request<RollResult>('/drop/roll', {
      method: 'POST',
      headers,
    });
  },

  getCollection: () =>
    request<{ items: NicknameItem[]; showcaseItemId?: string; totalCount: number }>('/collection'),

  toggleFavorite: (itemId: string) =>
    request<{ success: boolean; is_favorite: boolean }>(`/collection/${itemId}/favorite`, {
      method: 'POST',
    }),

  setShowcase: (itemId: string) =>
    request<{ success: boolean; showcasedItemId: string }>(`/collection/${itemId}/showcase`, {
      method: 'POST',
    }),

  dismantleItem: (itemId: string) =>
    request<{
      success: boolean;
      dismantleReward: number;
      newBalance: number;
      dismantledItem: NicknameItem;
    }>(`/collection/${itemId}/dismantle`, {
      method: 'POST',
    }),

  getActiveDeal: () => request<{ activeDeal: AvitaDeal | null }>('/avita/active-deal'),

  createQuote: (itemId: string) =>
    request<{ deal: AvitaDeal }>('/avita/quote', {
      method: 'POST',
      body: JSON.stringify({ itemId }),
    }),

  negotiateDeal: (dealId: string, action: string) =>
    request<{
      status: string;
      finalPrice?: number;
      newBalance?: number;
      message: string;
      soldItem?: NicknameItem;
      offeredPrice?: number;
      canAcceptOffered?: boolean;
      dealId?: string;
    }>('/avita/negotiate', {
      method: 'POST',
      body: JSON.stringify({ dealId, action }),
    }),

  acceptCounterOffer: (dealId: string) =>
    request<{
      status: string;
      finalPrice: number;
      newBalance: number;
      message: string;
      soldItem: NicknameItem;
    }>('/avita/accept-offer', {
      method: 'POST',
      body: JSON.stringify({ dealId }),
    }),

  cancelDeal: (dealId: string) =>
    request<{ success: boolean; message: string }>('/avita/cancel', {
      method: 'POST',
      body: JSON.stringify({ dealId }),
    }),

  bulkSell: (itemIds: string[]) =>
    request<{
      success: boolean;
      soldCount: number;
      baseTotal: number;
      bonusPercent: number;
      bonusAmount: number;
      finalTotal: number;
      newBalance: number;
      message: string;
    }>('/avita/bulk-sell', {
      method: 'POST',
      body: JSON.stringify({ itemIds }),
    }),

  getLeaderboard: () =>
    request<{
      leaderboard: LeaderboardEntry[];
      totalParticipants: number;
      userRank: number | null;
    }>('/leaderboard'),
};
