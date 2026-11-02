import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Bracket, Item } from '@/types';
import { pageTitle } from '../../components/PageMeta';

const bracket: Bracket = {
  id: 3, name: 'THE BUN ZONE BRACKET', description: null, type: 'video', category: 'Music',
  createdAt: '2026-06-18T12:00:00Z',
};
const items: Item[] = [1, 2, 3].map(id => ({
  id, bracketId: 3, title: `Entry ${id}`, mediaUrl: `https://example.com/${id}.png`, mediaType: 'video',
}));
const notFound = Object.assign(new Error('not found'), { status: 404 });

vi.mock('../../services/api', () => ({
  bracketApi: {
    getAllBrackets: vi.fn(async () => [bracket]),
    getPopularBrackets: vi.fn(async () => [bracket]),
    getBracket: vi.fn(async (id: number) => { if (id !== 3) throw notFound; return bracket; }),
    getBracketItems: vi.fn(async (id: number) => { if (id !== 3) throw notFound; return items; }),
    getBracketRankings: vi.fn(async () => []),
    getBracketComments: vi.fn(async () => []),
    getMyResults: vi.fn(async () => []),
  },
  errorMessage: () => 'failed',
  errorStatus: (error: { status?: number }) => error.status,
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ currentUser: null }),
}));

vi.mock('../../contexts/SessionBattleContext', () => ({
  useSessionBattles: () => ({ addSessionBattle: vi.fn(), getSessionBattlesForBracket: () => [] }),
}));

import HomePage from '../HomePage';
import BracketPage from '../BracketPage';
import ResultsPage from '../ResultsPage';
import NotFoundPage from '../NotFoundPage';

const renderAt = (url: string) => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/bracket/:id" element={<BracketPage />} />
      <Route path="/results/:id" element={<ResultsPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  </MemoryRouter>,
);

const canonical = () => document.head.querySelector('link[rel="canonical"]')?.getAttribute('href');
const robots = () => document.head.querySelector('meta[name="robots"]')?.getAttribute('content');
const description = () => document.head.querySelector('meta[name="description"]')?.getAttribute('content');

afterEach(cleanup);

describe('page titles and canonicals', () => {
  it('home', async () => {
    renderAt('/?utm=x');
    // Card links are named by the bracket name alone
    const cards = await screen.findAllByRole('link', { name: 'THE BUN ZONE BRACKET' });
    expect(cards[0]).toHaveAttribute('href', '/bracket/3');
    expect(screen.getByRole('link', { name: 'Make your own' })).toHaveAttribute('href', '/create');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Settle it head to head.');
    expect(document.title).toBe('Duely — Song, video & image brackets, voted head to head');
    expect(description()).toMatch(/^Make a bracket of songs, videos or images/);
    expect(canonical()).toBe(`${window.location.origin}/`);
    expect(robots()).toBeUndefined();
  });

  it('bracket', async () => {
    renderAt('/bracket/3');
    await screen.findByRole('heading', { level: 1, name: 'THE BUN ZONE BRACKET' });
    expect(document.title).toBe('THE BUN ZONE BRACKET — 3-entry video bracket | Duely');
    expect(description()).toContain('a 3-entry video bracket in Music');
    expect(canonical()).toBe(`${window.location.origin}/bracket/3`);
    expect(screen.getByRole('link', { name: 'See results so far' })).toHaveAttribute('href', '/results/3');
  });

  it('missing bracket is noindex', async () => {
    renderAt('/bracket/99');
    await screen.findByRole('heading', { name: 'Bracket not found' });
    expect(document.title).toBe('Bracket not found | Duely');
    expect(robots()).toBe('noindex');
    expect(canonical()).toBeUndefined();
    expect(screen.getByRole('link', { name: 'Browse brackets' })).toHaveAttribute('href', '/browse');
  });

  it('results drop ?fromBattle from the canonical', async () => {
    renderAt('/results/3?fromBattle=true');
    await screen.findByRole('heading', { level: 1, name: 'THE BUN ZONE BRACKET' });
    expect(document.title).toBe('THE BUN ZONE BRACKET results: everyone’s ranking | Duely');
    expect(canonical()).toBe(`${window.location.origin}/results/3`);
  });

  it('missing results are noindex', async () => {
    renderAt('/results/99');
    await screen.findByRole('heading', { name: 'Bracket not found' });
    expect(robots()).toBe('noindex');
  });

  it('not found', () => {
    renderAt('/nope');
    expect(document.title).toBe('Page not found | Duely');
    expect(robots()).toBe('noindex');
    expect(canonical()).toBeUndefined();
  });

  it('leaves the head when the page unmounts', async () => {
    const { unmount } = renderAt('/nope');
    unmount();
    await waitFor(() => expect(robots()).toBeUndefined());
  });
});

describe('pageTitle', () => {
  it('shortens long names to about 60 characters', () => {
    const long = 'A'.repeat(100);
    expect(pageTitle(long, ' — 8-entry song bracket')).toHaveLength(60);
    expect(pageTitle(long, ' results: everyone’s ranking', ' results')).toMatch(/A… results \| Duely$/);
    expect(pageTitle('Short', ' — 8-entry song bracket')).toBe('Short — 8-entry song bracket | Duely');
  });
});
