import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  deleteMyData: vi.fn(),
  logout: vi.fn(),
  clearSessionBattles: vi.fn(),
  isAdmin: false,
}));

vi.mock('../services/api', () => ({
  bracketApi: { deleteMyData: mocks.deleteMyData },
  errorMessage: () => 'Server said no',
}));
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    currentUser: { uid: 'u1', email: 'ann@example.test', displayName: 'Ann Lee', photoURL: null, isAdmin: mocks.isAdmin },
    logout: mocks.logout,
  }),
}));
vi.mock('../contexts/SessionBattleContext', () => ({
  useSessionBattles: () => ({ clearSessionBattles: mocks.clearSessionBattles }),
}));

import UserProfile from './UserProfile';

const renderMenu = () => render(
  <MemoryRouter initialEntries={['/browse']}>
    <UserProfile />
    <Routes>
      <Route path="/" element={<p>Home page</p>} />
      <Route path="/browse" element={<p>Browse page</p>} />
    </Routes>
  </MemoryRouter>,
);

afterEach(() => {
  mocks.deleteMyData.mockReset();
  mocks.logout.mockReset();
  mocks.clearSessionBattles.mockReset();
  mocks.isAdmin = false;
});

describe('UserProfile menu', () => {
  it('has no moderation link for ordinary users', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(screen.getByRole('menuitem', { name: 'My brackets' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Reports' })).not.toBeInTheDocument();
  });

  it('links admins to the moderation queue', async () => {
    mocks.isAdmin = true;
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(screen.getByRole('menuitem', { name: 'Reports' })).toHaveAttribute('href', '/admin');
  });

  it('deletes my data only after confirming, then signs out and goes home', async () => {
    mocks.deleteMyData.mockRejectedValueOnce(new Error('down')).mockResolvedValue(undefined);
    mocks.logout.mockResolvedValue(undefined);
    renderMenu();

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete my data' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete your data?' });
    expect(mocks.deleteMyData).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete my data' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Server said no');
    expect(mocks.logout).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete my data' }));
    expect(await screen.findByText('Home page')).toBeInTheDocument();
    expect(mocks.deleteMyData).toHaveBeenCalledTimes(2);
    expect(mocks.logout).toHaveBeenCalled();
    expect(mocks.clearSessionBattles).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
