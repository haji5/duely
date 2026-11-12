import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Bracket, HomeLists } from '@/types';

const bracket = (id: number, name: string, category = 'Music'): Bracket => ({
  id, name, description: null, type: 'song', category, createdAt: '2026-10-01T12:00:00Z', itemCount: 8, runCount: 3,
});

const api = vi.hoisted(() => ({ getHome: vi.fn() }));

vi.mock('../../services/api', () => ({
  bracketApi: api,
  errorMessage: () => 'failed',
}));

import HomePage from '../HomePage';

const renderHome = () => render(<MemoryRouter><HomePage /></MemoryRouter>);

describe('HomePage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the three lists from /home in the order the server gave', async () => {
    const home: HomeLists = {
      popular: [bracket(1, 'Most played'), bracket(2, 'Runner-up')],
      recent: [bracket(3, 'Brand new', 'Food')],
      categories: [
        { category: 'Music', brackets: [bracket(1, 'Most played')] },
        { category: 'Food', brackets: [bracket(3, 'Brand new', 'Food')] },
      ],
    };
    api.getHome.mockResolvedValue(home);
    renderHome();

    const headings = await screen.findAllByRole('heading', { level: 2 });
    expect(headings.map(h => h.textContent)).toEqual(
      ['How it works', 'Popular right now', 'Music', 'Food', 'Recently added']);
    expect(api.getHome).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'See all Food' })).toHaveAttribute('href', '/browse?category=Food&sort=popular');
  });

  it('leaves out the popular list until something has been played', async () => {
    api.getHome.mockResolvedValue({ popular: [], recent: [bracket(3, 'Unplayed')], categories: [] });
    renderHome();
    expect(await screen.findByText('Unplayed')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Popular right now' })).not.toBeInTheDocument();
  });

  it('says there are no brackets only when the server says so', async () => {
    api.getHome.mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue({ popular: [], recent: [], categories: [] });
    renderHome();

    expect(await screen.findByText('Brackets couldn’t be loaded')).toBeInTheDocument();
    expect(screen.queryByText('No brackets yet')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /retry|try again/i }));
    expect(await screen.findByRole('heading', { name: 'No brackets yet' })).toBeInTheDocument();
  });
});
