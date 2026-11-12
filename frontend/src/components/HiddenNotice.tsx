import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { adminApi, errorMessage } from '../services/api';

/**
 * Shown on a hidden bracket, which only its owner and admins can open. Admins can show it again
 * from here; `onShown` reloads the page’s data.
 */
const HiddenNotice: React.FC<{ bracketId: number; onShown: () => void }> = ({ bracketId, onShown }) => {
  const { currentUser } = useAuth();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const unhide = async () => {
    setBusy(true);
    setError(null);
    try {
      await adminApi.unhideBracket(bracketId);
      onShown();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <div className="notice notice-warning mb-8" role="status">
      <p className="font-semibold text-themed-primary">Hidden by a moderator</p>
      <p className="mt-0.5">
        This bracket isn’t listed and its links don’t open for anyone else.
        {currentUser?.isAdmin ? '' : ' You still see it because you made it.'}
      </p>
      {currentUser?.isAdmin && (
        <button type="button" onClick={() => void unhide()} className="btn btn-secondary mt-3" disabled={busy}>
          {busy ? <><span className="spinner" /> Showing…</> : 'Show it to everyone again'}
        </button>
      )}
      {error && <p className="mt-2 text-[0.8125rem]" role="alert">{error}</p>}
    </div>
  );
};

export default HiddenNotice;
