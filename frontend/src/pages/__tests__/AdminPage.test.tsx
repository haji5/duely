import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Report } from '@/types';

const api = vi.hoisted(() => ({
  getReports: vi.fn(),
  hideBracket: vi.fn(),
  unhideBracket: vi.fn(),
  clearComment: vi.fn(),
  resolveReport: vi.fn(),
  deleteResult: vi.fn(),
  deleteBracket: vi.fn(),
}));
const auth = vi.hoisted(() => ({ currentUser: null as null | { uid: string; isAdmin: boolean } }));

vi.mock('../../services/api', () => ({
  adminApi: {
    getReports: api.getReports, hideBracket: api.hideBracket, unhideBracket: api.unhideBracket,
    clearComment: api.clearComment, resolveReport: api.resolveReport, deleteResult: api.deleteResult,
  },
  bracketApi: { deleteBracket: api.deleteBracket },
  errorMessage: () => 'Server said no',
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ currentUser: auth.currentUser }) }));

import AdminPage from '../AdminPage';

const report = (overrides: Partial<Report>): Report => ({
  id: 1, targetType: 'bracket', targetId: 5, reason: 'spam', details: null, createdAt: '2026-11-01T10:00:00Z',
  resolvedAt: null, bracketId: 5, bracketName: 'Buy my stuff', bracketHidden: false, comment: null, displayName: null,
  ...overrides,
});

const renderAdmin = () => render(<MemoryRouter><AdminPage /></MemoryRouter>);

afterEach(() => {
  Object.values(api).forEach(fn => fn.mockReset());
  auth.currentUser = null;
});

describe('AdminPage', () => {
  it('shows only a notice to people without the admin claim', () => {
    auth.currentUser = { uid: 'u1', isAdmin: false };
    renderAdmin();
    expect(screen.getByRole('heading', { name: 'Moderators only' })).toBeInTheDocument();
    expect(api.getReports).not.toHaveBeenCalled();
  });

  it('lists open reports with what they are about, and acts on them', async () => {
    auth.currentUser = { uid: 'admin', isAdmin: true };
    api.getReports
      .mockResolvedValueOnce([
        report({
          id: 2, targetType: 'comment', targetId: 77, reason: 'harassment', bracketId: 9, bracketName: 'Best songs',
          comment: 'You all have terrible taste', displayName: 'Troll', details: 'Rude to everyone',
        }),
        report({}),
      ])
      .mockResolvedValue([report({})]);
    api.clearComment.mockResolvedValue(undefined);
    api.hideBracket.mockResolvedValue(undefined);
    renderAdmin();

    const rows = await screen.findAllByRole('listitem');
    expect(api.getReports).toHaveBeenCalledWith(true);
    expect(rows[0]).toHaveTextContent('Harassment or hate');
    expect(rows[0]).toHaveTextContent('You all have terrible taste');
    expect(rows[0]).toHaveTextContent('Reporter says: Rude to everyone');
    expect(within(rows[0]).getByRole('link', { name: 'Best songs' })).toHaveAttribute('href', '/results/9');
    expect(within(rows[1]).getByRole('link', { name: 'Buy my stuff' })).toHaveAttribute('href', '/bracket/5');

    await userEvent.click(within(rows[0]).getByRole('button', { name: 'Remove comment' }));
    expect(api.clearComment).toHaveBeenCalledWith(77);
    // The queue reloads after an action.
    expect(await screen.findByRole('button', { name: 'Hide bracket' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Hide bracket' }));
    expect(api.hideBracket).toHaveBeenCalledWith(5);
  });

  it('shows a failed action next to the report', async () => {
    auth.currentUser = { uid: 'admin', isAdmin: true };
    api.getReports.mockResolvedValue([report({})]);
    api.resolveReport.mockRejectedValue(new Error('500'));
    renderAdmin();

    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Server said no');
    expect(api.resolveReport).toHaveBeenCalledWith(1);
  });

  it('has distinct error and empty states', async () => {
    auth.currentUser = { uid: 'admin', isAdmin: true };
    api.getReports.mockRejectedValueOnce(new Error('down')).mockResolvedValue([]);
    renderAdmin();

    expect(await screen.findByRole('heading', { name: 'Reports couldn’t be loaded' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Nothing to look at' })).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Show handled reports'));
    expect(api.getReports).toHaveBeenLastCalledWith(false);
  });
});
