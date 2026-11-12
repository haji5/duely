import React from 'react';
import Dialog from './Dialog';
import { bracketApi, errorMessage } from '../services/api';
import type { ReportTargetType } from '@/types';
import { REPORT_REASONS, type ReportReason } from '@/utils/reports';

/** A small "Report" control that opens a dialog with a reason and optional details. Open to guests. */
const ReportButton: React.FC<{
  targetType: ReportTargetType;
  targetId: number;
  /** Accessible name, e.g. "Report this bracket". */
  label: string;
  className?: string;
}> = ({ targetType, targetId, label, className = '' }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        className={`inline-flex items-center gap-1 text-[0.8125rem] font-medium text-themed-tertiary underline-offset-2 hover:text-themed-primary hover:underline ${className}`}
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 21V4m0 0h11l-1.5 4L15 12H4" />
        </svg>
        Report
      </button>
      {open && <ReportDialog targetType={targetType} targetId={targetId} onClose={() => setOpen(false)} />}
    </>
  );
};

const ReportDialog: React.FC<{ targetType: ReportTargetType; targetId: number; onClose: () => void }> = ({
  targetType, targetId, onClose,
}) => {
  const [reason, setReason] = React.useState<ReportReason | null>(null);
  const [details, setDetails] = React.useState('');
  const [state, setState] = React.useState<{ status: 'idle' | 'sending' | 'sent' } | { status: 'error'; message: string }>(
    { status: 'idle' });
  const what = targetType === 'bracket' ? 'this bracket' : 'this comment';

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason || state.status === 'sending') return;
    setState({ status: 'sending' });
    try {
      await bracketApi.report({ targetType, targetId, reason, details: details.trim() || undefined });
      setState({ status: 'sent' });
    } catch (error) {
      setState({ status: 'error', message: errorMessage(error, 'The report couldn’t be sent.') });
    }
  };

  if (state.status === 'sent') {
    return (
      <Dialog title="Thanks for the report" onClose={onClose}>
        <p className="text-themed-secondary">A moderator will look at {what}. If it breaks the rules, it comes down.</p>
        <div className="mt-6 flex justify-end">
          <button type="button" onClick={onClose} className="btn btn-primary">Close</button>
        </div>
      </Dialog>
    );
  }

  const sending = state.status === 'sending';
  return (
    <Dialog title={`Report ${what}`} onClose={onClose} busy={sending}>
      <form onSubmit={(e) => void send(e)}>
        <fieldset disabled={sending}>
          <legend className="text-themed-secondary">What’s wrong with it?</legend>
          <div className="mt-3 grid gap-1.5">
            {REPORT_REASONS.map(r => (
              <label key={r.value} className="choice flex cursor-pointer items-center gap-3 px-3 py-2">
                <input
                  type="radio"
                  name="report-reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                />
                <span className="text-themed-primary">{r.label}</span>
              </label>
            ))}
          </div>
          <div className="mt-4">
            <div className="flex items-baseline justify-between">
              <label htmlFor="report-details" className="field-label">
                Details <span className="font-normal text-themed-tertiary">(optional)</span>
              </label>
              <span className="field-hint tabular">{details.length}/500</span>
            </div>
            <textarea
              id="report-details"
              maxLength={500}
              rows={3}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              className="field resize-none"
              placeholder="Anything that helps a moderator decide"
            />
          </div>
        </fieldset>
        {state.status === 'error' && (
          <div className="notice notice-error mt-4" role="alert">
            <p className="font-semibold text-themed-primary">The report wasn’t sent</p>
            <p className="mt-0.5">{state.message}</p>
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-secondary" disabled={sending}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!reason || sending}>
            {sending ? <><span className="spinner" /> Sending…</> : state.status === 'error' ? 'Try again' : 'Send report'}
          </button>
        </div>
      </form>
    </Dialog>
  );
};

export default ReportButton;
