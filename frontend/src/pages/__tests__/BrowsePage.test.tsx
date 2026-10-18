import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Bracket } from '@/types';

const bracket = (id: number, name: string): Bracket => ({
  id, name, description: null, type: 'image', category: 'General', createdAt: '2026-10-01T12:00:00Z',
});

vi.mock('../../services/api', () => ({
  bracketApi: {
    getAllBrackets: vi.fn(async () => [bracket(1, 'Everyone’s bracket'), bracket(2, 'My bracket')]),
    getMyBrackets: vi.fn(async () => [bracket(2, 'My bracket')]),
    getPopularBrackets: vi.fn(async () => []),
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
});
