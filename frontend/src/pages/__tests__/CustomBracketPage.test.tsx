import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

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
import { bracketApi } from '../../services/api';

// Unmounting saves the draft, so unmount first, then forget it.
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

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

  it('requires a category instead of defaulting to General', async () => {
    render(<MemoryRouter><CustomBracketPage /></MemoryRouter>);
    const category = screen.getByLabelText('Category');
    expect(category).toHaveValue('');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Best videos' } });
    const [url1, url2] = screen.getAllByLabelText(/YouTube link/);
    const [title1, title2] = screen.getAllByLabelText('Title');
    fireEvent.change(url1, { target: { value: 'https://youtu.be/DDDDDDDDDDD' } });
    fireEvent.change(url2, { target: { value: 'https://youtu.be/EEEEEEEEEEE' } });
    fireEvent.change(title1, { target: { value: 'One' } });
    fireEvent.change(title2, { target: { value: 'Two' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create bracket' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Pick a category');
    expect(category).toHaveAttribute('aria-invalid', 'true');
    expect(bracketApi.createBracket).not.toHaveBeenCalled();
  });

  it('infers Music for song brackets, but keeps a category the user picked', () => {
    render(<MemoryRouter><CustomBracketPage /></MemoryRouter>);
    const category = screen.getByLabelText('Category');
    fireEvent.click(screen.getByLabelText('Songs'));
    expect(category).toHaveValue('Music');

    fireEvent.change(category, { target: { value: 'Movies' } });
    fireEvent.click(screen.getByLabelText('Videos'));
    fireEvent.click(screen.getByLabelText('Songs'));
    expect(category).toHaveValue('Movies');
  });

  it('infers Music after a Spotify playlist import', async () => {
    vi.mocked(bracketApi.getSpotifyPlaylist).mockResolvedValue([
      { title: 'Song A', mediaUrl: 'https://open.spotify.com/track/a' },
      { title: 'Song B', mediaUrl: 'https://open.spotify.com/track/b' },
    ] as Awaited<ReturnType<typeof bracketApi.getSpotifyPlaylist>>);
    vi.mocked(bracketApi.searchYouTube).mockResolvedValue('https://youtu.be/FFFFFFFFFFF');
    render(<MemoryRouter><CustomBracketPage /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText('Fill from a Spotify playlist'), { target: { value: 'https://open.spotify.com/playlist/abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() => expect(screen.getByLabelText('Category')).toHaveValue('Music'));
  });

  it('keeps the form as a draft until the bracket is made, and can start over', () => {
    const first = render(<MemoryRouter><CustomBracketPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Half done' } });
    fireEvent.change(screen.getAllByLabelText('Title')[0], { target: { value: 'Kept entry' } });
    first.unmount();

    render(<MemoryRouter><CustomBracketPage /></MemoryRouter>);
    expect(screen.getByText('Your draft is back')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Half done');
    expect(screen.getAllByLabelText('Title')[0]).toHaveValue('Kept entry');
    expect(screen.getAllByLabelText('Title')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    expect(screen.getByLabelText('Name')).toHaveValue('');
    expect(screen.queryByText('Your draft is back')).not.toBeInTheDocument();
    expect(window.localStorage.getItem('duely:create-draft')).toBeNull();
  });

  it('asks before leaving with unsaved work, and forgets the draft once created', async () => {
    vi.mocked(bracketApi.createBracket).mockResolvedValue({ id: 5 } as Awaited<ReturnType<typeof bracketApi.createBracket>>);
    render(
      <MemoryRouter initialEntries={['/create']}>
        <Routes>
          <Route path="/create" element={<CustomBracketPage />} />
          <Route path="/bracket/:id" element={<p>Bracket page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    const leave = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(leave()).toBe(false);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ready' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Music' } });
    const [url1, url2] = screen.getAllByLabelText(/YouTube link/);
    const [title1, title2] = screen.getAllByLabelText('Title');
    fireEvent.change(url1, { target: { value: 'https://youtu.be/GGGGGGGGGGG' } });
    fireEvent.change(url2, { target: { value: 'https://youtu.be/HHHHHHHHHHH' } });
    fireEvent.change(title1, { target: { value: 'One' } });
    fireEvent.change(title2, { target: { value: 'Two' } });
    expect(leave()).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Create bracket' }));
    expect(await screen.findByText('Bracket page')).toBeInTheDocument();
    expect(window.localStorage.getItem('duely:create-draft')).toBeNull();
    expect(leave()).toBe(false);
  });
});
