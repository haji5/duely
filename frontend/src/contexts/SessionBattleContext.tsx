import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { MatchOutcome, SessionBattle } from '@/types';
import { randomId } from '@/utils/ids';
import { session } from '@/utils/storage';

/**
 * A guest's own runs. Kept in sessionStorage, so they survive reloads but end with the tab;
 * signed-in users get their history from the server instead.
 */
interface SessionBattleContextType {
  sessionBattles: SessionBattle[];
  addSessionBattle: (battle: {
    bracketId: number; bracketName: string; ranking: number[]; matches: MatchOutcome[];
    displayName?: string; comment?: string;
  }) => void;
  /** This bracket's runs, oldest first. */
  getSessionBattlesForBracket: (bracketId: number) => SessionBattle[];
  clearSessionBattles: () => void;
}

const STORAGE_KEY = 'duely:session-battles';

const SessionBattleContext = createContext<SessionBattleContextType | undefined>(undefined);

export const useSessionBattles = () => {
  const context = useContext(SessionBattleContext);
  if (context === undefined) {
    throw new Error('useSessionBattles must be used within a SessionBattleProvider');
  }
  return context;
};

function load(): SessionBattle[] {
  try {
    const parsed: unknown = JSON.parse(session.get(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as SessionBattle[]) : [];
  } catch {
    return [];
  }
}

export const SessionBattleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sessionBattles, setSessionBattles] = useState<SessionBattle[]>(load);

  const update = useCallback((next: (prev: SessionBattle[]) => SessionBattle[]) => {
    setSessionBattles(prev => {
      const value = next(prev);
      session.set(STORAGE_KEY, JSON.stringify(value));
      return value;
    });
  }, []);

  const addSessionBattle = useCallback<SessionBattleContextType['addSessionBattle']>((battle) => {
    update(prev => [...prev, { ...battle, sessionId: randomId(), createdAt: new Date().toISOString() }]);
  }, [update]);

  const getSessionBattlesForBracket = useCallback(
    (bracketId: number) => sessionBattles.filter(b => b.bracketId === bracketId),
    [sessionBattles]);

  const clearSessionBattles = useCallback(() => update(() => []), [update]);

  const value = useMemo(
    () => ({ sessionBattles, addSessionBattle, getSessionBattlesForBracket, clearSessionBattles }),
    [sessionBattles, addSessionBattle, getSessionBattlesForBracket, clearSessionBattles]);

  return <SessionBattleContext.Provider value={value}>{children}</SessionBattleContext.Provider>;
};
