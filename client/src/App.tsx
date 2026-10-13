import React, { useState, useEffect } from 'react';
import { api, UserProfile, UserStats } from './api/client.js';
import { initTelegramApp, getTelegramWebApp } from './telegram/telegram-sdk.js';
import { Navigation, TabId } from './components/Navigation.js';
import { HuntScreen } from './screens/HuntScreen.js';
import { CollectionScreen } from './screens/CollectionScreen.js';
import { AvitaScreen } from './screens/AvitaScreen.js';
import { LeaderboardScreen } from './screens/LeaderboardScreen.js';
import { ProfileScreen } from './screens/ProfileScreen.js';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<TabId>('hunt');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [preselectedAvitaItemId, setPreselectedAvitaItemId] = useState<string | null>(null);

  useEffect(() => {
    initTelegramApp();

    const storedMotion = localStorage.getItem('nh_reduced_motion');
    if (storedMotion === 'true') {
      setReducedMotion(true);
    }

    const loadUser = async () => {
      try {
        setLoading(true);
        const data = await api.getMe();
        setUser(data.user);
        setStats(data.stats);
      } catch (err) {
        console.error('Failed to load user info:', err);
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, []);

  const handleToggleReducedMotion = () => {
    const newVal = !reducedMotion;
    setReducedMotion(newVal);
    localStorage.setItem('nh_reduced_motion', String(newVal));
  };

  const handleSelectForAvita = (itemId: string) => {
    setPreselectedAvitaItemId(itemId);
    setCurrentTab('avita');
  };

  if (loading || !user || !stats) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0f1117] text-slate-400 gap-3">
        <div className="w-10 h-10 border-4 border-sky-500/20 border-t-sky-500 rounded-full animate-spin" />
        <span className="text-xs font-mono tracking-wider uppercase">Загрузка NickHunter...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f1117] text-slate-100 flex flex-col font-sans select-none antialiased">
      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-md mx-auto">
        {currentTab === 'hunt' && (
          <HuntScreen
            balance={user.balance_ud}
            pityCounter={stats.pity_counter}
            reducedMotion={reducedMotion}
            onBalanceChange={(newBal) => setUser((prev) => prev && { ...prev, balance_ud: newBal })}
            onPityChange={(newPity) => setStats((prev) => prev && { ...prev, pity_counter: newPity })}
          />
        )}

        {currentTab === 'collection' && (
          <CollectionScreen
            onSelectForAvita={handleSelectForAvita}
            onBalanceChange={(newBal) => setUser((prev) => prev && { ...prev, balance_ud: newBal })}
          />
        )}

        {currentTab === 'avita' && (
          <AvitaScreen
            preselectedItemId={preselectedAvitaItemId}
            onClearPreselectedItem={() => setPreselectedAvitaItemId(null)}
            onBalanceChange={(newBal) => setUser((prev) => prev && { ...prev, balance_ud: newBal })}
          />
        )}

        {currentTab === 'leaderboard' && <LeaderboardScreen />}

        {currentTab === 'profile' && (
          <ProfileScreen
            user={user}
            stats={stats}
            reducedMotion={reducedMotion}
            onToggleReducedMotion={handleToggleReducedMotion}
            onPrivacyToggle={(newVal) =>
              setUser((prev) => prev && { ...prev, privacy_hide_balance: newVal })
            }
          />
        )}
      </main>

      {/* 5-Tab Navigation Bar */}
      <Navigation currentTab={currentTab} onChangeTab={setCurrentTab} />
    </div>
  );
};
