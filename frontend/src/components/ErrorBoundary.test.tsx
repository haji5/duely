import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErrorBoundary, { CHUNK_RELOAD_KEY, isChunkLoadError } from './ErrorBoundary';

const Boom: React.FC<{ error: Error }> = ({ error }) => {
  throw error;
};

const chunkError = () => new TypeError('Failed to fetch dynamically imported module: /assets/BracketPage-abc.js');

describe('ErrorBoundary', () => {
  beforeEach(() => {
    sessionStorage.clear();
    // React logs caught render errors; keep the output readable.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders its children when nothing throws', () => {
    render(<ErrorBoundary><p>fine</p></ErrorBoundary>);
    expect(screen.getByText('fine')).toBeInTheDocument();
  });

  it('shows a message and a reload button instead of a blank page', async () => {
    const reload = vi.fn();
    render(<ErrorBoundary reload={reload}><Boom error={new Error('render bug')} /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(reload).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads once by itself when a page chunk is missing after a deploy', () => {
    const reload = vi.fn();
    render(<ErrorBoundary reload={reload}><Boom error={chunkError()} /></ErrorBoundary>);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(CHUNK_RELOAD_KEY)).not.toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('updated');
  });

  it('does not reload again straight after an automatic reload', () => {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
    const reload = vi.fn();
    render(<ErrorBoundary reload={reload}><Boom error={chunkError()} /></ErrorBoundary>);
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  it('clears the error when the reset key changes', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="/bracket/1"><Boom error={new Error('x')} /></ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    rerender(<ErrorBoundary resetKey="/browse"><p>another page</p></ErrorBoundary>);
    expect(screen.getByText('another page')).toBeInTheDocument();
  });

  it('recognises the chunk errors browsers raise', () => {
    expect(isChunkLoadError(chunkError())).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkLoadError('not an error')).toBe(false);
  });
});
