import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Title lookups that resolve only when the test says so.
const pending = new Map<string, (title: string | null) => void>();
vi.mock('../../services/oembed', () => ({
  fetchMediaTitle: vi.fn((url: string) => new Promise<string | null>(resolve => pending.set(url, resolve))),
}));

vi.mock('../../services/api', () => ({
  bracketApi: { createBracket: vi.fn(), searchYouTube: vi.fn(), getSpotifyPlaylist: vi.fn() },
  errorMessage: () => 'failed',
  fieldErrors: () => ({}),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ currentUser: { uid: 'u1', email: null, displayName: 'Tester', photoURL: null }, signInWithGoogle: vi.fn() }),
}));

import CustomBracketPage from '../CustomBracketPage';

const URL_1 = 'https://youtu.be/AAAAAAAAAAA';
const URL_2 = 'https://youtu.be/BBBBBBBBBBB';

describe('CustomBracketPage', () => {
  it('a late title lookup for one entry never overwrites another entry', async () => {
    render(<MemoryRouter><CustomBracketPage /></MemoryRouter>);
    const [url1, url2] = screen.getAllByLabelText(/YouTube link/);
    const [title1, title2] = screen.getAllByLabelText('Title');

    fireEvent.change(url1, { target: { value: URL_1 } });
    await waitFor(() => expect(pending.has(URL_1)).toBe(true)); // debounced lookup started
    fireEvent.change(url2, { target: { value: URL_2 } });

    await act(async () => pending.get(URL_1)!('Title A'));

    expect(url1).toHaveValue(URL_1);
    expect(url2).toHaveValue(URL_2);
    expect(title1).toHaveValue('Title A');
    expect(title2).toHaveValue('');
  });

  it('does not overwrite a title the user typed', async () => {
    render(<MemoryRouter><CustomBracketPage /></MemoryRouter>);
    const [url1] = screen.getAllByLabelText(/YouTube link/);
    const [title1] = screen.getAllByLabelText('Title');
    const url = 'https://youtu.be/CCCCCCCCCCC';

    fireEvent.change(url1, { target: { value: url } });
    await waitFor(() => expect(pending.has(url)).toBe(true));
    fireEvent.change(title1, { target: { value: 'My own title' } });
    await act(async () => pending.get(url)!('Fetched title'));

    expect(title1).toHaveValue('My own title');
  });
});
