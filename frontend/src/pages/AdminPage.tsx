import React from 'react';
import { Link } from 'react-router-dom';
import { formatDate, PageLoader } from '../components/BracketCard';
import { ErrorState } from '../components/PageStates';
import PageMeta from '../components/PageMeta';
import { useAuth } from '../contexts/AuthContext';
import { adminApi, bracketApi, errorMessage } from '../services/api';
import type { Report } from '@/types';
import { reasonLabel } from '@/utils/reports';

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; reports: Report[] };

/**
 * The moderation queue: open reports, newest first, with what each is about and what can be done
 * about it. Acting on a target resolves every open report about it on the server.
 */
const AdminPage: React.FC = () => {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.isAdmin ?? false;
  const [showResolved, setShowResolved] = React.useState(false);
  const [load, setLoad] = React.useState<Load>({ status: 'loading' });
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    setLoad({ status: 'loading' });
    adminApi.getReports(!showResolved).then(
      reports => { if (!cancelled) setLoad({ status: 'ready', reports }); },
      error => { if (!cancelled) setLoad({ status: 'error', message: errorMessage(error) }); },
    );
    return () => { cancelled = true; };
  }, [isAdmin, showResolved, reloadKey]);

  if (!isAdmin) {
    return (
      <div className="page flex min-h-[60vh] flex-col items-start justify-center py-16">
        <PageMeta title="Moderation | Duely" noindex />
        <h1 className="font-display text-[2.75rem] font-black leading-none">Moderators only</h1>
        <p className="mt-3 max-w-lg text-lg text-themed-secondary">
          {currentUser ? 'This account can’t moderate Duely.' : 'Sign in with a moderator account to see the reports.'}
        </p>
        <Link to="/" className="btn btn-secondary mt-8">Back to Duely</Link>
      </div>
    );
  }

  return (
    <div className="page max-w-4xl pb-24 pt-10 sm:pt-14">
      <PageMeta title="Moderation | Duely" noindex />
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[3rem] font-black leading-none text-themed-primary">Reports</h1>
          <p className="mt-3 text-lg text-themed-secondary">
            {showResolved ? 'The latest reports, handled ones included.' : 'Reports nobody has dealt with yet, newest first.'}
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-themed-secondary">
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
          Show handled reports
        </label>
      </header>

      {load.status === 'loading' && <PageLoader label="Loading reports" />}
      {load.status === 'error' && (
        <ErrorState title="Reports couldn’t be loaded" message={load.message} onRetry={() => setReloadKey(k => k + 1)} />
      )}
      {load.status === 'ready' && (load.reports.length === 0 ? (
        <div className="card flex flex-col items-start px-6 py-12">
          <h2 className="font-display text-2xl font-extrabold">Nothing to look at</h2>
          <p className="mt-1 text-themed-secondary">No open reports. New ones show up here.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {load.reports.map(report => (
            <ReportRow key={report.id} report={report} onChanged={() => setReloadKey(k => k + 1)} />
          ))}
        </ul>
      ))}
    </div>
  );
};

const ReportRow: React.FC<{ report: Report; onChanged: () => void }> = ({ report, onChanged }) => {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const act = (label: string, action: () => Promise<void>, question?: string) => async () => {
    if (question && !window.confirm(question)) return;
    setBusy(label);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const gone = report.bracketId === null || (report.targetType === 'comment' && report.comment === null);
  const button = (label: string, action: () => Promise<void>, question?: string) => (
    <button type="button" onClick={() => void act(label, action, question)()} className="btn btn-secondary px-3 py-1.5 text-sm"
      disabled={busy !== null}>
      {busy === label ? <><span className="spinner" /> {label}…</> : label}
    </button>
  );

  return (
    <li className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm text-themed-tertiary">
        <span>
          <span className="font-semibold text-themed-primary">{reasonLabel(report.reason)}</span>
          {' · '}{report.targetType === 'bracket' ? 'Bracket' : 'Comment'}
          {report.bracketHidden && ' · hidden'}
        </span>
        <span>
          {formatDate(report.createdAt)}
          {report.resolvedAt && <> · handled {formatDate(report.resolvedAt)}</>}
        </span>
      </div>

      {report.bracketId !== null && (
        <p className="mt-2 font-display text-xl font-extrabold text-themed-primary">
          <Link to={`/${report.targetType === 'comment' ? 'results' : 'bracket'}/${report.bracketId}`} className="hover:underline">
            {report.bracketName}
          </Link>
        </p>
      )}
      {report.targetType === 'comment' && report.comment !== null && (
        <blockquote className="mt-2 border-l-4 border-themed-primary pl-3">
          <p className="text-sm font-semibold text-themed-secondary">{report.displayName || 'Anonymous'}</p>
          <p className="whitespace-pre-line text-themed-secondary">{report.comment}</p>
        </blockquote>
      )}
      {gone && <p className="mt-2 text-themed-tertiary">What was reported is already gone.</p>}
      {report.details && (
        <p className="mt-3 whitespace-pre-line text-themed-secondary">
          <span className="font-semibold text-themed-primary">Reporter says: </span>{report.details}
        </p>
      )}

      {!report.resolvedAt && (
        <div className="mt-4 flex flex-wrap gap-2">
          {report.targetType === 'bracket' && report.bracketId !== null && (
            report.bracketHidden
              ? button('Show bracket', () => adminApi.unhideBracket(report.targetId))
              : button('Hide bracket', () => adminApi.hideBracket(report.targetId))
          )}
          {report.targetType === 'bracket' && report.bracketId !== null && button('Delete bracket',
            () => bracketApi.deleteBracket(report.targetId),
            `Delete “${report.bracketName}” with all its runs? This can’t be undone.`)}
          {report.targetType === 'comment' && !gone && button('Remove comment', () => adminApi.clearComment(report.targetId))}
          {report.targetType === 'comment' && !gone && button('Delete run',
            () => adminApi.deleteResult(report.targetId),
            'Delete this run? It also comes off the leaderboard. This can’t be undone.')}
          {button('Dismiss', () => adminApi.resolveReport(report.id))}
        </div>
      )}
      {error && (
        <div className="notice notice-error mt-3" role="alert">
          <p className="font-semibold text-themed-primary">That didn’t work</p>
          <p className="mt-0.5">{error}</p>
        </div>
      )}
    </li>
  );
};

export default AdminPage;
