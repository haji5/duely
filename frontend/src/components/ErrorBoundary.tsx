import React from 'react';
import { session } from '@/utils/storage';

/** When the last automatic reload happened; guards against a reload loop. */
export const CHUNK_RELOAD_KEY = 'chunkReloadAt';
const CHUNK_RELOAD_COOLDOWN_MS = 60_000;

/**
 * A lazy page chunk that no longer exists: the tab was opened before a deploy replaced the
 * hashed files. Browsers word this differently, so match all of them.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'ChunkLoadError'
    || /dynamically imported module|Importing a module script failed|module script|Loading chunk .* failed/i.test(error.message);
}

interface Props {
  children: React.ReactNode;
  /** The error clears when this changes, so navigating away from a broken page recovers. */
  resetKey?: string;
  reload?: () => void;
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors in the routed content so one broken page doesn't blank the whole app.
 * A missing chunk after a deploy is fixed by loading the new build, so that reloads once by itself.
 */
class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    if (!isChunkLoadError(error)) {
      console.error('Page crashed', error);
      return;
    }
    const last = Number(session.get(CHUNK_RELOAD_KEY) ?? 0);
    if (Date.now() - last > CHUNK_RELOAD_COOLDOWN_MS) {
      session.set(CHUNK_RELOAD_KEY, String(Date.now()));
      this.reload();
    }
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private reload = () => (this.props.reload ?? (() => window.location.reload()))();

  render() {
    if (!this.state.error) return this.props.children;
    const outdated = isChunkLoadError(this.state.error);
    return (
      <div className="container mx-auto max-w-2xl px-4 py-16">
        <div className="card flex flex-col items-start px-6 py-10" role="alert">
          <h1 className="font-display text-2xl font-extrabold">
            {outdated ? 'Duely has been updated' : 'Something went wrong'}
          </h1>
          <p className="mt-1 text-themed-secondary">
            {outdated
              ? 'This page needs the latest version. Reload to continue.'
              : 'This page ran into a problem. Reloading usually fixes it.'}
          </p>
          <button type="button" onClick={this.reload} className="btn btn-primary mt-6">
            Reload
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
