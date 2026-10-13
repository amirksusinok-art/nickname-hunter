export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: any;
    };
  }
}

export const getTelegramWebApp = () => {
  if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
    return window.Telegram.WebApp;
  }
  return null;
};

export const initTelegramApp = () => {
  const tg = getTelegramWebApp();
  if (tg) {
    try {
      tg.ready();
      tg.expand();
      if (typeof tg.enableClosingConfirmation === 'function') {
        tg.enableClosingConfirmation();
      }
      if (typeof tg.isVersionAtLeast === 'function' && tg.isVersionAtLeast('8.0')) {
        if (typeof tg.requestFullscreen === 'function') {
          tg.requestFullscreen();
        }
      }
    } catch (e) {
      console.warn('[TMA] Failed to initialize native WebApp features:', e);
    }
  }
};

export const haptic = {
  impact: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'medium') => {
    const tg = getTelegramWebApp();
    try {
      tg?.HapticFeedback?.impactOccurred(style);
    } catch {
      // safe fallback
    }
  },
  notification: (type: 'error' | 'success' | 'warning' = 'success') => {
    const tg = getTelegramWebApp();
    try {
      tg?.HapticFeedback?.notificationOccurred(type);
    } catch {
      // safe fallback
    }
  },
  selection: () => {
    const tg = getTelegramWebApp();
    try {
      tg?.HapticFeedback?.selectionChanged();
    } catch {
      // safe fallback
    }
  },
};

export const getAuthHeader = (): string => {
  const tg = getTelegramWebApp();
  if (tg?.initData && tg.initData.length > 0) {
    return `tma ${tg.initData}`;
  }
  return 'tma mock';
};

export const getTelegramUser = (): TelegramUser | null => {
  const tg = getTelegramWebApp();
  if (tg?.initDataUnsafe?.user) {
    return tg.initDataUnsafe.user;
  }
  return {
    id: 123456789,
    first_name: 'Hunter',
    username: 'hunter_dev',
  };
};
