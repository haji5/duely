import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { Bracket, BracketPage, BracketQuery } from '@/types';

const bracket = (id: number, name: string): Bracket => ({
  id, name, description: null, type: 'image', category: 'General', createdAt: '2026-10-01T12:00:00Z',
  itemCount: 4, runCount: id,
});
const pageOf = (items: Bracket[], total = items.length, page = 0, size = 24): BracketPage => ({ items, page, size, total });

const api = vi.hoisted(() => ({
  deleteBracket: vi.fn(),
  listBrackets: vi.fn(),
  getMyBrackets: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  bracketApi: api,
  errorMessage: () => 'failed',
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ currentUser: { uid: 'u1', email: null, displayName: 'Tester', photoURL: null } }),
}));

import BrowsePage from '../BrowsePage';

/** The current URL's query string, for asserting what the page wrote back. */
const Search = () => <output data-testid="search">{useLocation().search}</output>;

const renderAt = (url: string) => render(
  <MemoryRouter initialEntries={[url]}>
    <Link to="/browse">Browse</Link>
    <Search />
    <Routes>
      <Route path="/browse" element={<BrowsePage />} />
    </Routes>
  </MemoryRouter>,
);

const lastQuery = (): BracketQuery => api.listBrackets.mock.calls.at(-1)?.[0];

describe('BrowsePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    api.listBrackets.mockResolvedValue(pageOf([bracket(1, 'Everyone’s bracket'), bracket(2, 'My bracket')]));
    api.getMyBrackets.mockResolvedValue(pageOf([
      bracket(2, 'My bracket'),
      { ...bracket(3, 'Hidden one'), hiddenAt: '2026-11-01T00:00:00Z' },
    ]));
  });

  it('asks the server for exactly what the URL says', async () => {
    renderAt('/browse?q=cats&type=video&category=Music&sort=popular&page=3');
    await screen.findByText('Everyone’s bracket');
    expect(lastQuery()).toEqual({ sort: 'popular', type: 'video', category: 'Music', q: 'cats', page: 2, size: 24 });
    expect(screen.getByRole('combobox', { name: 'Sort by' })).toHaveValue('popular');
  });

  it('reads sort values from older links', async () => {
    renderAt('/browse?sort=name-asc&type=gif');
    await screen.findByText('Everyone’s bracket');
    expect(lastQuery()).toMatchObject({ sort: 'name', type: undefined, page: 0 });
  });

  it('searches once typing pauses, from the first page', async () => {
    renderAt('/browse?page=2');
    await screen.findByText('Everyone’s bracket');
    const before = api.listBrackets.mock.calls.length;

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search brackets' }), 'dogs');

    await waitFor(() => expect(lastQuery()).toMatchObject({ q: 'dogs', page: 0 }));
    // One request for the finished word, not one per letter.
    const searched = api.listBrackets.mock.calls.slice(before).map(([query]) => query.q);
    expect(searched.filter(q => q && q !== 'dogs')).toEqual([]);
    expect(screen.getByTestId('search')).toHaveTextContent('?q=dogs');
  });

  it('pages through the results with the server', async () => {
    api.listBrackets.mockImplementation(async (query: BracketQuery) =>
      pageOf([bracket(10 + (query.page ?? 0), `Bracket on page ${(query.page ?? 0) + 1}`)], 50, query.page ?? 0));
    renderAt('/browse');

    expect(await screen.findByText('Bracket on page 1')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    expect(screen.getByText(/Showing 1–1 of 50 brackets/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Bracket on page 2')).toBeInTheDocument();
    expect(lastQuery()).toMatchObject({ page: 1 });
    expect(screen.getByTestId('search')).toHaveTextContent('?page=2');
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
  });

  it('says so when a page is past the end instead of "no brackets"', async () => {
    api.listBrackets.mockImplementation(async (query: BracketQuery) =>
      (query.page ? pageOf([], 3, query.page) : pageOf([bracket(1, 'Back at the start')], 3)));
    renderAt('/browse?page=9');

    expect(await screen.findByRole('heading', { name: 'This page is past the end' })).toBeInTheDocument();
    expect(screen.queryByText('No brackets yet')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Go to the first page' }));
    expect(await screen.findByText('Back at the start')).toBeInTheDocument();
  });

  it('shows an error with a retry, never an empty list, when loading fails', async () => {
    api.listBrackets.mockRejectedValueOnce(new Error('down'));
    renderAt('/browse');

    expect(await screen.findByText('Brackets couldn’t be loaded')).toBeInTheDocument();
    expect(screen.queryByText('No brackets yet')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /retry|try again/i }));
    expect(await screen.findByText('Everyone’s bracket')).toBeInTheDocument();
  });

  it('shows entry and run counts on the cards', async () => {
    renderAt('/browse');
    const card = await screen.findByRole('link', { name: 'My bracket' });
    expect(within(card).getByText('4 entries')).toBeInTheDocument();
    expect(within(card).getByText('2 runs')).toBeInTheDocument();
  });

  it('resets "My brackets" when the navbar Browse link (/browse) is followed', async () => {
    renderAt('/browse?mine=1');

    expect(await screen.findByRole('heading', { name: 'My brackets' })).toBeInTheDocument();
    expect(await screen.findByText('My bracket')).toBeInTheDocument();
    expect(screen.queryByText('Everyone’s bracket')).not.toBeInTheDocument();
    expect(api.getMyBrackets).toHaveBeenCalled();

    await userEvent.click(screen.getByRole('link', { name: 'Browse' }));

    expect(await screen.findByRole('heading', { name: 'Browse brackets' })).toBeInTheDocument();
    expect(await screen.findByText('Everyone’s bracket')).toBeInTheDocument();
  });

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
    expect(screen.getByText(/of 1 bracket$/)).toBeInTheDocument();
  });

  it('offers no delete outside My brackets', async () => {
    renderAt('/browse');
    expect(await screen.findByText('Everyone’s bracket')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument();
  });
});
