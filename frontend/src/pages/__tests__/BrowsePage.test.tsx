import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Bracket } from '@/types';

const bracket = (id: number, name: string): Bracket => ({
  id, name, description: null, type: 'image', category: 'General', createdAt: '2026-10-01T12:00:00Z',
});

const api = vi.hoisted(() => ({ deleteBracket: vi.fn() }));

vi.mock('../../services/api', () => ({
  bracketApi: {
    getAllBrackets: vi.fn(async () => [bracket(1, 'Everyone’s bracket'), bracket(2, 'My bracket')]),
    getMyBrackets: vi.fn(async () => [
      bracket(2, 'My bracket'),
      { ...bracket(3, 'Hidden one'), hiddenAt: '2026-11-01T00:00:00Z' },
    ]),
    getPopularBrackets: vi.fn(async () => []),
    deleteBracket: api.deleteBracket,
  },
  errorMessage: () => 'failed',
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ currentUser: { uid: 'u1', email: null, displayName: 'Tester', photoURL: null } }),
}));

import BrowsePage from '../BrowsePage';

describe('BrowsePage', () => {
  it('resets "My brackets" when the navbar Browse link (/browse) is followed', async () => {
    render(
      <MemoryRouter initialEntries={['/browse?mine=1']}>
        <Link to="/browse">Browse</Link>
        <Routes>
          <Route path="/browse" element={<BrowsePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'My brackets' })).toBeInTheDocument();
    expect(await screen.findByText('My bracket')).toBeInTheDocument();
    expect(screen.queryByText('Everyone’s bracket')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'Browse' }));

    expect(await screen.findByRole('heading', { name: 'Browse brackets' })).toBeInTheDocument();
    expect(await screen.findByText('Everyone’s bracket')).toBeInTheDocument();
  });

  const renderAt = (url: string) => render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/browse" element={<BrowsePage />} />
      </Routes>
    </MemoryRouter>,
  );

  it('lets the owner delete a bracket from My brackets, after confirming', async () => {
    api.deleteBracket.mockRejectedValueOnce(new Error('down')).mockResolvedValue(undefined);
    renderAt('/browse?mine=1');

    expect(await screen.findByText('Hidden', { selector: 'span' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete My bracket' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete this bracket?' });
    expect(api.deleteBracket).not.toHaveBeenCalled();

    // A failed delete says so and keeps the bracket.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete bracket' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('failed');
    expect(screen.getByText('My bracket')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete bracket' }));
    expect(api.deleteBracket).toHaveBeenLastCalledWith(2);
    expect(await screen.findByText('Hidden one')).toBeInTheDocument();
    expect(screen.queryByText('My bracket')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('offers no delete outside My brackets', async () => {
    renderAt('/browse');
    expect(await screen.findByText('Everyone’s bracket')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument();
  });
});
