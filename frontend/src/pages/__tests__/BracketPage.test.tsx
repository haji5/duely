import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Bracket, Item } from '@/types';

const bracket: Bracket = {
  id: 3, name: 'Bun Zone', description: 'Songs from the zone.', type: 'image', category: 'Music', createdAt: '2026-10-01T12:00:00Z',
  itemCount: 12, runCount: 0,
};
const items: Item[] = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1, bracketId: 3, title: `Entry ${i + 1}`, mediaUrl: `https://x.test/${i + 1}.png`, mediaType: 'image',
}));

const api = vi.hoisted(() => ({
  getBracketRankings: vi.fn(),
  startRun: vi.fn(),
  saveBracketResult: vi.fn(),
  addSessionBattle: vi.fn(),
}));
const auth = vi.hoisted(() => ({ currentUser: null as null | { uid: string; displayName: string | null } }));

vi.mock('../../services/api', () => ({
  bracketApi: {
    getBracket: vi.fn(async () => bracket),
    getBracketItems: vi.fn(async () => items),
    getBracketRankings: api.getBracketRankings,
    startRun: api.startRun,
    saveBracketResult: api.saveBracketResult,
  },
  errorMessage: () => 'Server said no',
  errorStatus: () => undefined,
}));

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ currentUser: auth.currentUser }) }));
vi.mock('../../contexts/SessionBattleContext', () => ({ useSessionBattles: () => ({ addSessionBattle: api.addSessionBattle }) }));
vi.mock('@/utils/sound', () => ({ playSelectionTick: vi.fn(), playSuccessChime: vi.fn(), playTick: vi.fn() }));

import BracketPage from '../BracketPage';

const tree = () => (
  <MemoryRouter initialEntries={['/bracket/3']}>
    <Routes>
      <Route path="/bracket/:id" element={<BracketPage />} />
      <Route path="/results/:id" element={<p>Results page</p>} />
    </Routes>
  </MemoryRouter>
);
const renderBracket = () => render(tree());

afterEach(() => {
  Object.values(api).forEach(fn => fn.mockReset());
  auth.currentUser = null;
  bracket.hiddenAt = undefined;
  vi.useRealTimers();
  window.sessionStorage.clear();
});

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
      { item: items[4], wins: 3, totalMatches: 3, winPercentage: 100, score: 0.995, averageScore: 1, timesRanked: 1 },
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

describe('BracketPage runs', () => {
  it('plays the entrants the server picked, in its seeding order', async () => {
    api.getBracketRankings.mockResolvedValue([]);
    api.startRun.mockResolvedValue({ ticket: 'signed', entrantIds: [7, 2, 11, 4, 9, 1, 12, 5], size: 8 });
    renderBracket();

    await userEvent.click(await screen.findByRole('button', { name: 'Start the quarterfinals' }));
    expect(api.startRun).toHaveBeenCalledWith(3, 8);
    expect(await screen.findByRole('button', { name: 'Pick Entry 7' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pick Entry 2' })).toBeInTheDocument();
  });

  it('shows a retryable error when the run cannot start', async () => {
    api.getBracketRankings.mockResolvedValue([]);
    api.startRun.mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({ ticket: 'signed', entrantIds: [3, 6], size: 2 });
    renderBracket();
    await userEvent.click(await screen.findByRole('radio', { name: /Final/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Start the final' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Server said no');
    await userEvent.click(screen.getByRole('button', { name: 'Try again: start the final' }));
    expect(await screen.findByRole('button', { name: 'Pick Entry 3' })).toBeInTheDocument();
  });

  it('refuses entrants it does not know, instead of playing a different bracket', async () => {
    api.getBracketRankings.mockResolvedValue([]);
    api.startRun.mockResolvedValue({ ticket: 'signed', entrantIds: [3, 99], size: 2 });
    renderBracket();
    await userEvent.click(await screen.findByRole('radio', { name: /Final/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Start the final' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Reload the page');
  });

  it('saves the ticket and matches, keeps the comment through a sign-in, and stores the server’s ranking', async () => {
    api.getBracketRankings.mockResolvedValue([]);
    api.startRun.mockResolvedValue({ ticket: 'signed', entrantIds: [3, 6], size: 2 });
    api.saveBracketResult.mockResolvedValue({ id: 1, bracketId: 3, ranking: [6, 3], matches: [], createdAt: '' });
    const view = renderBracket();
    await userEvent.click(await screen.findByRole('radio', { name: /Final/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Start the final' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Pick Entry 6' }));

    const comment = await screen.findByLabelText(/Comment/, {}, { timeout: 3000 });
    await userEvent.type(comment, 'Six all the way');
    // Signing in on the champion screen must not wipe what was typed.
    auth.currentUser = { uid: 'u1', displayName: 'Sam' };
    act(() => view.rerender(tree()));
    expect(screen.getByLabelText(/Comment/)).toHaveValue('Six all the way');
    expect(screen.getByLabelText('Your name')).toHaveValue('Sam');

    auth.currentUser = null;
    act(() => view.rerender(tree()));
    await userEvent.click(screen.getByRole('button', { name: 'Post and see results' }));
    expect(api.saveBracketResult).toHaveBeenCalledWith(3, {
      ticket: 'signed', matches: [{ winnerId: 6, loserId: 3 }], displayName: 'Sam', comment: 'Six all the way',
    });
    expect(api.addSessionBattle).toHaveBeenCalledWith(expect.objectContaining({ ranking: [6, 3] }));
    expect(await screen.findByText('Results page')).toBeInTheDocument();
    // Saved: nothing is left to resume.
    expect(window.sessionStorage.getItem('duely:run:3')).toBeNull();
  });
});

describe('BracketPage resume', () => {
  it('picks a run up where a reload left it, with the same ticket', async () => {
    api.getBracketRankings.mockResolvedValue([]);
    api.startRun.mockResolvedValue({ ticket: 'signed', entrantIds: [7, 2, 11, 4, 9, 1, 12, 5], size: 8 });
    const first = renderBracket();
    await userEvent.click(await screen.findByRole('button', { name: 'Start the quarterfinals' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Pick Entry 7' }));
    expect(await screen.findByRole('button', { name: 'Pick Entry 11' }, { timeout: 3000 })).toBeInTheDocument();
    first.unmount();

    renderBracket();
    expect(await screen.findByText('You have a run in progress')).toBeInTheDocument();
    expect(screen.getByText('Quarterfinals, match 2 of 4.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.getByRole('button', { name: 'Pick Entry 11' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pick Entry 4' })).toBeInTheDocument();
    expect(api.startRun).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.sessionStorage.getItem('duely:run:3') ?? '{}')).toMatchObject({ ticket: 'signed', picks: [7] });
  });

  it('can discard the unfinished run instead', async () => {
    api.getBracketRankings.mockResolvedValue([]);
    window.sessionStorage.setItem('duely:run:3', JSON.stringify({
      ticket: 'old', size: 2, entrantIds: [3, 6], picks: [6], startedAt: Date.now(),
    }));
    renderBracket();
    expect(await screen.findByText('You finished it but haven’t saved it yet.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Discard it' }));
    expect(screen.queryByText('You have a run in progress')).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem('duely:run:3')).toBeNull();
  });
});

describe('BracketPage moderation', () => {
  it('lets anyone report the bracket', async () => {
    api.getBracketRankings.mockResolvedValue([]);
    renderBracket();
    expect(await screen.findByRole('button', { name: 'Report this bracket' })).toBeInTheDocument();
    expect(screen.queryByText('Hidden by a moderator')).not.toBeInTheDocument();
  });

  it('tells the owner of a hidden bracket that nobody else can see it', async () => {
    api.getBracketRankings.mockResolvedValue([]);
    bracket.hiddenAt = '2026-11-01T00:00:00Z';
    auth.currentUser = { uid: 'owner', displayName: 'Owner' };
    renderBracket();
    expect(await screen.findByText('Hidden by a moderator')).toBeInTheDocument();
    expect(screen.getByText(/You still see it because you made it/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show it to everyone again' })).not.toBeInTheDocument();
  });
});
