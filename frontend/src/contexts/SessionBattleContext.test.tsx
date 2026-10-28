import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { SessionBattleProvider, useSessionBattles } from './SessionBattleContext';

const KEY = 'duely:session-battles';
const wrapper = ({ children }: { children: ReactNode }) => <SessionBattleProvider>{children}</SessionBattleProvider>;
const battle = (bracketId: number) => ({
  bracketId, bracketName: `B${bracketId}`, ranking: [1, 2], matches: [{ winnerId: 1, loserId: 2 }],
});

describe('SessionBattleContext', () => {
  afterEach(() => window.sessionStorage.clear());

  it('adds runs, persists them and filters by bracket in order', () => {
    const { result } = renderHook(() => useSessionBattles(), { wrapper });
    act(() => result.current.addSessionBattle(battle(1)));
    act(() => result.current.addSessionBattle(battle(2)));
    act(() => result.current.addSessionBattle({ ...battle(1), comment: 'again' }));

    const forOne = result.current.getSessionBattlesForBracket(1);
    expect(forOne).toHaveLength(2);
    expect(forOne[1].comment).toBe('again');
    expect(forOne[0].sessionId).not.toBe(forOne[1].sessionId);
    expect(JSON.parse(window.sessionStorage.getItem(KEY)!)).toHaveLength(3);
  });

  it('survives a reload', () => {
    const first = renderHook(() => useSessionBattles(), { wrapper });
    act(() => first.result.current.addSessionBattle(battle(3)));
    first.unmount();
    const second = renderHook(() => useSessionBattles(), { wrapper });
    expect(second.result.current.getSessionBattlesForBracket(3)).toHaveLength(1);
  });

  it.each(['{not json', '{"a":1}', 'null', '42'])('starts empty when storage holds %s', (stored) => {
    window.sessionStorage.setItem(KEY, stored);
    const { result } = renderHook(() => useSessionBattles(), { wrapper });
    expect(result.current.sessionBattles).toEqual([]);
  });

  it('clears everything', () => {
    const { result } = renderHook(() => useSessionBattles(), { wrapper });
    act(() => result.current.addSessionBattle(battle(1)));
    act(() => result.current.clearSessionBattles());
    expect(result.current.sessionBattles).toEqual([]);
    expect(window.sessionStorage.getItem(KEY)).toBe('[]');
  });

  it('throws outside the provider', () => {
    expect(() => renderHook(() => useSessionBattles())).toThrow(/SessionBattleProvider/);
  });
});
