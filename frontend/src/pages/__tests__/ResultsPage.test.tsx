import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Bracket, Item, ItemRanking } from '@/types';

const bracket: Bracket = {
  id: 3, name: 'Bun Zone', description: null, type: 'song', category: 'Music', createdAt: '2026-10-01T12:00:00Z',
};
const item = (id: number, title: string): Item => ({ id, bracketId: 3, title, mediaUrl: 'https://x.test/a.mp3', mediaType: 'song' });
const items = [item(1, 'Alpha'), item(2, 'Bravo'), item(3, 'Charlie')];

// Bravo has the higher win rate but the lower average finish: the case that looked like a bug.
const rankings: ItemRanking[] = [
  { item: items[0], wins: 5, totalMatches: 8, winPercentage: 62, averageScore: 0.74, timesRanked: 4 },
  { item: items[1], wins: 5, totalMatches: 7, winPercentage: 71, averageScore: 0.71, timesRanked: 3 },
  { item: items[2], wins: 1, totalMatches: 6, winPercentage: 17, averageScore: 0.2, timesRanked: 4 },
];

vi.mock('../../services/api', () => ({
  bracketApi: {
    getBracket: vi.fn(async () => bracket),
    getBracketItems: vi.fn(async () => items),
    getBracketRankings: vi.fn(async () => rankings),
    getBracketComments: vi.fn(async () => []),
    getMyResults: vi.fn(async () => []),
  },
  errorMessage: () => 'failed',
  errorStatus: () => undefined,
}));

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ currentUser: null }) }));
vi.mock('../../contexts/SessionBattleContext', () => ({
  useSessionBattles: () => ({ getSessionBattlesForBracket: () => [] }),
}));

import ResultsPage from '../ResultsPage';

const renderResults = () => render(
  <MemoryRouter initialEntries={['/results/3']}>
    <Routes>
      <Route path="/results/:id" element={<ResultsPage />} />
    </Routes>
  </MemoryRouter>,
);

describe('ResultsPage ranking', () => {
  it('explains the order and shows the score it is sorted by', async () => {
    renderResults();

    expect(await screen.findByText(/Ranked by average finish across at least 4 runs\./)).toBeInTheDocument();
    const rows = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(rows.map(r => within(r).getByText(/^Score \d+$/).textContent)).toEqual(['Score 74', 'Score 71', 'Score 20']);
    expect(rows[1]).toHaveTextContent('71% of 7 matches won');
  });

  it('opens with a one-line summary of the leader and the run count', async () => {
    renderResults();
    expect(await screen.findByText('Alpha leads everyone’s ranking of 3 entries, based on at least 4 runs.')).toBeInTheDocument();
  });

  it('hides the "Show" filter when Everyone is the only option', async () => {
    renderResults();
    await screen.findByText(/Ranked by average finish/);
    expect(screen.queryByRole('button', { name: /Everyone/ })).not.toBeInTheDocument();
  });
});
