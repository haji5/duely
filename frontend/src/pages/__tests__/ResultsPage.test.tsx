import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Bracket, Item, ItemRanking } from '@/types';

const bracket: Bracket = {
  id: 3, name: 'Bun Zone', description: null, type: 'song', category: 'Music', createdAt: '2026-10-01T12:00:00Z',
};
const item = (id: number, title: string): Item => ({ id, bracketId: 3, title, mediaUrl: 'https://x.test/a.mp3', mediaType: 'song' });
const items = [item(1, 'Alpha'), item(2, 'Bravo'), item(3, 'Charlie')];
const state = vi.hoisted(() => ({ items: [] as Item[], battles: [] as unknown[] }));

// Bravo has the higher win rate but the lower average finish: the case that looked like a bug.
const rankings: ItemRanking[] = [
  { item: items[0], wins: 5, totalMatches: 8, winPercentage: 62, score: 0.63, averageScore: 0.74, timesRanked: 4 },
  { item: items[1], wins: 5, totalMatches: 7, winPercentage: 71, score: 0.6, averageScore: 0.71, timesRanked: 3 },
  { item: items[2], wins: 1, totalMatches: 6, winPercentage: 17, score: 0.33, averageScore: 0.2, timesRanked: 4 },
];

const api = vi.hoisted(() => ({ getBracketStats: vi.fn() }));

vi.mock('../../services/api', () => ({
  bracketApi: {
    getBracket: vi.fn(async () => bracket),
    getBracketItems: vi.fn(async () => (state.items.length ? state.items : items)),
    getBracketRankings: vi.fn(async () => rankings),
    getBracketComments: vi.fn(async () => []),
    getBracketStats: api.getBracketStats,
    getMyResults: vi.fn(async () => []),
  },
  errorMessage: () => 'failed',
  errorStatus: () => undefined,
}));

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ currentUser: null }) }));
vi.mock('../../contexts/SessionBattleContext', () => ({
  useSessionBattles: () => ({ getSessionBattlesForBracket: () => state.battles }),
}));

import ResultsPage from '../ResultsPage';

const renderResults = (path = '/results/3') => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/results/:id" element={<ResultsPage />} />
    </Routes>
  </MemoryRouter>,
);

afterEach(() => {
  api.getBracketStats.mockReset();
  state.items = [];
  state.battles = [];
});

describe('ResultsPage ranking', () => {
  it('explains the order with the exact run count and shows the score it is sorted by', async () => {
    api.getBracketStats.mockResolvedValue({ runCount: 5 });
    renderResults();

    expect(await screen.findByText(/Ranked by average finish across 5 runs,/)).toBeInTheDocument();
    const rows = within(screen.getByRole('list')).getAllByRole('listitem');
    // The adjusted score the list is sorted by, not the raw average.
    expect(rows.map(r => within(r).getByText(/^Score \d+$/).textContent)).toEqual(['Score 63', 'Score 60', 'Score 33']);
    expect(rows[1]).toHaveTextContent('71% of 7 matches won');
  });

  it('opens with a one-line summary of the leader and the run count', async () => {
    api.getBracketStats.mockResolvedValue({ runCount: 5 });
    renderResults();
    expect(await screen.findByText('Alpha leads everyone’s ranking of 3 entries, based on 5 runs.')).toBeInTheDocument();
  });

  it('falls back to a lower bound from the rankings when the run count fails', async () => {
    api.getBracketStats.mockRejectedValue(new Error('down'));
    renderResults();
    expect(await screen.findByText(/Ranked by average finish across at least 4 runs,/)).toBeInTheDocument();
    expect(screen.getByText(/based on at least 4 runs\./)).toBeInTheDocument();
  });

  it('hides the "Show" filter when Everyone is the only option', async () => {
    api.getBracketStats.mockResolvedValue({ runCount: 5 });
    renderResults();
    await screen.findByText(/Ranked by average finish/);
    expect(screen.queryByRole('button', { name: /Everyone/ })).not.toBeInTheDocument();
  });
});

describe('ResultsPage run view', () => {
  it('shows entries knocked out in the same round as sharing a place', async () => {
    api.getBracketStats.mockResolvedValue({ runCount: 1 });
    state.items = [...items, item(4, 'Delta')];
    state.battles = [{
      sessionId: 's1', bracketId: 3, bracketName: 'Bun Zone', ranking: [2, 1, 3, 4], createdAt: '2026-11-01T00:00:00Z',
      matches: [{ winnerId: 2, loserId: 4 }, { winnerId: 1, loserId: 3 }, { winnerId: 2, loserId: 1 }],
    }];
    renderResults('/results/3?fromBattle=true');

    expect(await screen.findByRole('heading', { name: 'Your run' })).toBeInTheDocument();
    const rows = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(rows.map(r => r.textContent)).toEqual([
      expect.stringMatching(/^1Bravo.*Champion/),
      expect.stringMatching(/^2Alpha.*Runner-up/),
      expect.stringMatching(/^3–4Charlie.*Joint 3rd–4th/),
      expect.stringMatching(/^3–4Delta.*Joint 3rd–4th/),
    ]);
  });
});

