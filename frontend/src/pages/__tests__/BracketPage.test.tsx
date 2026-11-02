import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Bracket, Item } from '@/types';

const bracket: Bracket = {
  id: 3, name: 'Bun Zone', description: 'Songs from the zone.', type: 'image', category: 'Music', createdAt: '2026-10-01T12:00:00Z',
};
const items: Item[] = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1, bracketId: 3, title: `Entry ${i + 1}`, mediaUrl: `https://x.test/${i + 1}.png`, mediaType: 'image',
}));

const api = vi.hoisted(() => ({ getBracketRankings: vi.fn() }));

vi.mock('../../services/api', () => ({
  bracketApi: {
    getBracket: vi.fn(async () => bracket),
    getBracketItems: vi.fn(async () => items),
    getBracketRankings: api.getBracketRankings,
  },
  errorMessage: () => 'Server said no',
  errorStatus: () => undefined,
}));

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ currentUser: null }) }));
vi.mock('../../contexts/SessionBattleContext', () => ({ useSessionBattles: () => ({ addSessionBattle: vi.fn() }) }));
vi.mock('@/utils/sound', () => ({ playSelectionTick: vi.fn(), playSuccessChime: vi.fn(), playTick: vi.fn() }));

import BracketPage from '../BracketPage';

const renderBracket = () => render(
  <MemoryRouter initialEntries={['/bracket/3']}>
    <Routes>
      <Route path="/bracket/:id" element={<BracketPage />} />
    </Routes>
  </MemoryRouter>,
);

afterEach(() => api.getBracketRankings.mockReset());

describe('BracketPage setup', () => {
  it('preselects the largest size that fits, so the start button works on arrival', async () => {
    api.getBracketRankings.mockResolvedValue([]);
    renderBracket();

    const start = await screen.findByRole('button', { name: 'Start the quarterfinals' });
    expect(start).toBeEnabled();
    expect(screen.getByRole('radio', { name: /Quarterfinals/ })).toBeChecked();

    await userEvent.click(screen.getByRole('radio', { name: /Round of 16/ }));
    expect(screen.getByRole('button', { name: 'Start the round of 16' })).toBeEnabled();
  });

  it('lists every entry and names the current leader', async () => {
    api.getBracketRankings.mockResolvedValue([
      { item: items[4], wins: 3, totalMatches: 3, winPercentage: 100, averageScore: 1, timesRanked: 1 },
    ]);
    renderBracket();

    expect(await screen.findByRole('heading', { name: 'The 12 entries' })).toBeInTheDocument();
    expect(screen.getAllByText(/^Entry \d+$/).length).toBeGreaterThanOrEqual(12);
    expect(await screen.findByText('Score 100 · 100% of matches won')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See results so far' })).toHaveAttribute('href', '/results/3');
  });

  it('keeps the bracket playable when the ranking fails, with its own retry', async () => {
    api.getBracketRankings.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce([]);
    renderBracket();

    expect(await screen.findByText(/The ranking couldn’t be loaded/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start the quarterfinals' })).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/Nobody has finished this bracket yet/)).toBeInTheDocument();
  });
});
