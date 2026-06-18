import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

interface SessionBattle {
  sessionId: string;
  bracketId: number;
  bracketName: string;
  ranking: number[];
  createdAt: Date;
  displayName?: string;
  comment?: string;
}

interface SessionBattleContextType {
  sessionBattles: SessionBattle[];
  addSessionBattle: (bracketId: number, bracketName: string, ranking: number[], displayName?: string, comment?: string) => void;
  getSessionBattlesForBracket: (bracketId: number) => SessionBattle[];
  clearSessionBattles: () => void;
}

const SessionBattleContext = createContext<SessionBattleContextType | undefined>(undefined);

export const useSessionBattles = () => {
  const context = useContext(SessionBattleContext);
  if (context === undefined) {
    throw new Error('useSessionBattles must be used within a SessionBattleProvider');
  }
  return context;
};

export const SessionBattleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sessionBattles, setSessionBattles] = useState<SessionBattle[]>([]);
  const { user } = useAuth();

  // Clear session battles when user logs out
  useEffect(() => {
    if (!user) {
      // User logged out or is not logged in, keep session battles
      return;
    }
    // User is logged in, we can keep both session and backend data
    // Session battles will be used as fallback for non-logged-in state
  }, [user]);

  const addSessionBattle = (bracketId: number, bracketName: string, ranking: number[], displayName?: string, comment?: string) => {
    const newBattle: SessionBattle = {
      sessionId: `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      bracketId,
      bracketName,
      ranking,
      createdAt: new Date(),
      displayName,
      comment
    };

    setSessionBattles(prev => [newBattle, ...prev]);
  };

  const getSessionBattlesForBracket = (bracketId: number): SessionBattle[] => {
    return sessionBattles
      .filter(battle => battle.bracketId === bracketId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  };

  const clearSessionBattles = () => {
    setSessionBattles([]);
  };

  const value = {
    sessionBattles,
    addSessionBattle,
    getSessionBattlesForBracket,
    clearSessionBattles
  };

  return (
    <SessionBattleContext.Provider value={value}>
      {children}
    </SessionBattleContext.Provider>
  );
};
