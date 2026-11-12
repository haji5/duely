import React from 'react';
import Dialog from './Dialog';
import { errorMessage } from '../services/api';

/**
 * Asks before something that can't be undone. Stays open while `onConfirm` runs and shows
 * its error, so a failed delete is never mistaken for a done one.
 */
const ConfirmDialog: React.FC<{
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  busyLabel: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}> = ({ title, children, confirmLabel, busyLabel, onConfirm, onClose }) => {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Dialog title={title} onClose={onClose} busy={busy}>
      <div className="space-y-3 text-themed-secondary">{children}</div>
      {error && (
        <div className="notice notice-error mt-4" role="alert">
          <p className="font-semibold text-themed-primary">That didn’t work</p>
          <p className="mt-0.5">{error}</p>
        </div>
      )}
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} className="btn btn-secondary" disabled={busy}>Cancel</button>
        <button type="button" onClick={() => void confirm()} className="btn btn-primary" disabled={busy}>
          {busy ? <><span className="spinner" /> {busyLabel}</> : confirmLabel}
        </button>
      </div>
    </Dialog>
  );
};

export default ConfirmDialog;
