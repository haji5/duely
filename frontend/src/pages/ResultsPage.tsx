import React from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import MediaPreview from '../components/MediaPreview';
import { PageLoader, TypeIcon, formatDate } from '../components/BracketCard';
import { ErrorState } from '../components/PageStates';
import { bracketApi, errorMessage, errorStatus } from '../services/api';
import type { Bracket, Comment, Item, ItemRanking, MatchOutcome } from '@/types';
import { useAuth } from '../contexts/AuthContext';
import { useSessionBattles } from '../contexts/SessionBattleContext';
import { computeRankings } from '@/utils/rankings';

/** One of the viewer's own runs: from the server when signed in, from this tab when a guest. */
interface Run {
  key: string;
  ranking: number[];
  matches?: MatchOutcome[];
  createdAt: string;
}

type Section<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; value: T };
type View = { kind: 'everyone' } | { kind: 'personal' } | { kind: 'run'; key: string };

const ResultsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const bracketId = Number(id);
  const { currentUser } = useAuth();
  const uid = currentUser?.uid ?? null;
  const { getSessionBattlesForBracket } = useSessionBattles();
  const [searchParams] = useSearchParams();
  const fromBattle = searchParams.get('fromBattle') === 'true';

  const [page, setPage] = React.useState<Section<{ bracket: Bracket; items: Item[] }>>({ status: 'loading' });
  const [notFound, setNotFound] = React.useState(false);
  const [rankings, setRankings] = React.useState<Section<ItemRanking[]>>({ status: 'loading' });
  const [comments, setComments] = React.useState<Section<Comment[]>>({ status: 'loading' });
  const [serverRuns, setServerRuns] = React.useState<Section<Run[]>>({ status: 'loading' });
  const [view, setView] = React.useState<View>({ kind: 'everyone' });
  const [reloadKey, setReloadKey] = React.useState(0);

  // Everything is per bracket and per viewer: reset and reload when either changes, and ignore
  // responses that arrive for a previous bracket or user.
  React.useEffect(() => {
    let cancelled = false;
    const guard = <T,>(set: (s: Section<T>) => void) => ({
      ok: (value: T) => { if (!cancelled) set({ status: 'ready', value }); },
      fail: (error: unknown) => { if (!cancelled) set({ status: 'error', message: errorMessage(error) }); },
    });
    setPage({ status: 'loading' });
    setNotFound(false);
    setRankings({ status: 'loading' });
    setComments({ status: 'loading' });
    setServerRuns({ status: 'loading' });
    setView({ kind: 'everyone' });
    if (!Number.isInteger(bracketId) || bracketId <= 0) {
      setNotFound(true);
      return;
    }

    const p = guard(setPage);
    Promise.all([bracketApi.getBracket(bracketId), bracketApi.getBracketItems(bracketId)])
      .then(([bracket, items]) => p.ok({ bracket, items }))
      .catch(error => {
        if (!cancelled && errorStatus(error) === 404) setNotFound(true);
        p.fail(error);
      });
    const r = guard(setRankings);
    bracketApi.getBracketRankings(bracketId).then(r.ok, r.fail);
    const c = guard(setComments);
    bracketApi.getBracketComments(bracketId).then(c.ok, c.fail);
    const s = guard(setServerRuns);
    if (uid) {
      bracketApi.getMyResults(bracketId)
        .then(results => s.ok(results.map(res => ({ key: `result-${res.id}`, ranking: res.ranking, createdAt: res.createdAt }))))
        .catch(s.fail);
    } else {
      s.ok([]);
    }
    return () => { cancelled = true; };
  }, [bracketId, uid, reloadKey]);

  const guestRuns = React.useMemo<Run[]>(() => (uid ? [] : getSessionBattlesForBracket(bracketId).map(b => ({
    key: `session-${b.sessionId}`, ranking: b.ranking, matches: b.matches, createdAt: b.createdAt,
  }))), [uid, bracketId, getSessionBattlesForBracket]);

  const runs: Run[] = uid ? (serverRuns.status === 'ready' ? serverRuns.value : []) : guestRuns;
  const runsReady = uid ? serverRuns.status === 'ready' : true;

  // Arriving from a finished battle shows that run, once, when the runs have loaded.
  const appliedFromBattle = React.useRef<string | null>(null);
  React.useEffect(() => {
    const marker = `${bracketId}:${uid}:${reloadKey}`;
    if (!fromBattle || !runsReady || appliedFromBattle.current === marker) return;
    appliedFromBattle.current = marker;
    if (runs.length > 0) setView({ kind: 'run', key: runs[runs.length - 1].key });
  }, [fromBattle, runsReady, runs, bracketId, uid, reloadKey]);

  const items = page.status === 'ready' ? page.value.items : [];
  const itemsById = React.useMemo(() => new Map(items.map(item => [item.id, item])), [items]);
  const personalRanking = React.useMemo(() => computeRankings(runs, items), [runs, items]);

  if (notFound) {
    return (
      <div className="page flex min-h-[60vh] flex-col items-start justify-center py-16">
        <h1 className="font-display text-[2.75rem] font-black leading-none">Bracket not found</h1>
        <p className="mt-3 text-lg text-themed-secondary">It may have been removed, or the link is wrong.</p>
        <Link to="/browse" className="btn btn-primary mt-8">Browse brackets</Link>
      </div>
    );
  }
  if (page.status === 'loading') return <PageLoader label="Loading results" />;
  if (page.status === 'error') {
    return (
      <div className="page py-16">
        <ErrorState title="Results couldn’t be loaded" message={page.message} onRetry={() => setReloadKey(k => k + 1)} />
      </div>
    );
  }

  const { bracket } = page.value;
  const selectedRun = view.kind === 'run' ? runs.find(r => r.key === view.key) : undefined;
  const rankingTitle = view.kind === 'everyone' ? 'Everyone’s ranking' : view.kind === 'personal' ? 'Your ranking' : 'Your run';

  let rankingBody: React.ReactNode;
  if (view.kind === 'everyone' && rankings.status !== 'ready') {
    rankingBody = rankings.status === 'loading'
      ? <PageLoader label="Loading rankings" />
      : <ErrorState title="Rankings couldn’t be loaded" message={rankings.message} onRetry={() => setReloadKey(k => k + 1)} />;
  } else if (view.kind !== 'everyone' && uid && serverRuns.status === 'error') {
    rankingBody = <ErrorState title="Your runs couldn’t be loaded" message={serverRuns.message} onRetry={() => setReloadKey(k => k + 1)} />;
  } else {
    const rows: { item: Item; stats?: ItemRanking }[] = view.kind === 'everyone'
      ? (rankings.status === 'ready' ? rankings.value : []).map(r => ({ item: r.item, stats: r }))
      : view.kind === 'personal'
        ? personalRanking.map(r => ({ item: r.item, stats: r }))
        : (selectedRun?.ranking ?? []).map(itemId => itemsById.get(itemId)).filter((i): i is Item => !!i).map(item => ({ item }));
    rankingBody = rows.length === 0 ? (
      <div className="card flex flex-col items-start px-6 py-12">
        <h3 className="font-display text-2xl font-extrabold">No results yet</h3>
        <p className="mt-1 text-themed-secondary">
          {view.kind === 'everyone'
            ? 'Nobody has finished this bracket yet. Play it and yours will be the first.'
            : 'Finish a run of this bracket to see your ranking here.'}
        </p>
        <Link to={`/bracket/${bracketId}`} className="btn btn-primary mt-6">Play this bracket</Link>
      </div>
    ) : (
      <ol className="divide-y divide-[color:var(--border-primary)]">
        {rows.map(({ item, stats }, index) => <RankingRow key={item.id} item={item} stats={stats} index={index} />)}
      </ol>
    );
  }

  return (
    <div className="page pb-24 pt-10 sm:pt-14">
      <header className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-themed-secondary">
            <TypeIcon type={bracket.type} />
            Results
          </p>
          <h1 className="font-display text-[2.75rem] font-black leading-[0.95] text-themed-primary sm:text-[3.5rem]">
            {bracket.name}
          </h1>
          {bracket.description && <p className="mt-3 max-w-2xl whitespace-pre-line text-lg text-themed-secondary">{bracket.description}</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          <Link to={`/bracket/${bracketId}`} className="btn btn-primary">Play again</Link>
          <Link to="/browse" className="btn btn-secondary">Browse brackets</Link>
        </div>
      </header>

      {!currentUser && (
        <div className="notice notice-info mb-8 max-w-3xl">
          You’re playing as a guest. Your picks count toward everyone’s ranking, and your own runs are
          kept until you close this tab. Sign in to keep them.
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-[13rem_minmax(0,1fr)_18rem]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <h2 className="mb-2 text-sm font-semibold text-themed-tertiary">Show</h2>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            <button onClick={() => setView({ kind: 'everyone' })} aria-pressed={view.kind === 'everyone'} className="choice">
              <span className="block text-themed-primary">Everyone</span>
              <span className="block text-xs font-medium text-themed-tertiary">All completed runs</span>
            </button>
            {runs.length > 0 && (
              <button onClick={() => setView({ kind: 'personal' })} aria-pressed={view.kind === 'personal'} className="choice">
                <span className="block text-themed-primary">You</span>
                <span className="block text-xs font-medium text-themed-tertiary">
                  Average of your {runs.length} {runs.length === 1 ? 'run' : 'runs'}{!currentUser && ', this tab'}
                </span>
              </button>
            )}
          </div>

          {runs.length > 0 && (
            <>
              <h2 className="mb-2 mt-6 text-sm font-semibold text-themed-tertiary">Your runs{!currentUser && ' in this tab'}</h2>
              <div className="flex gap-2 overflow-x-auto pb-1 lg:max-h-72 lg:flex-col lg:overflow-y-auto lg:overflow-x-visible lg:pb-0">
                {[...runs].reverse().slice(0, 10).map((run, index) => (
                  <button
                    key={run.key}
                    onClick={() => setView({ kind: 'run', key: run.key })}
                    aria-pressed={view.kind === 'run' && view.key === run.key}
                    className="choice shrink-0 py-1.5 text-sm"
                  >
                    <span className="block text-themed-primary">Run {runs.length - index}</span>
                    <span className="block text-xs font-medium text-themed-tertiary">{formatDate(run.createdAt)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </aside>

        <section aria-labelledby="ranking-title">
          <div className="mb-4 flex items-baseline justify-between gap-4 border-b border-themed-primary pb-3">
            <h2 id="ranking-title" className="font-display text-[2rem] font-extrabold leading-none text-themed-primary">
              {rankingTitle}
            </h2>
            {selectedRun && (
              <span className="text-sm text-themed-tertiary">{new Date(selectedRun.createdAt).toLocaleString()}</span>
            )}
          </div>
          {rankingBody}
        </section>

        {/* Comments show in every view, so a comment just posted is visible next to your run. */}
        <section className="lg:col-start-2 xl:col-start-auto" aria-labelledby="comments-title">
          <h2 id="comments-title" className="mb-4 border-b border-themed-primary pb-3 font-display text-[2rem] font-extrabold leading-none text-themed-primary">
            What people said
          </h2>
          {comments.status === 'loading' && <p className="text-themed-tertiary">Loading comments…</p>}
          {comments.status === 'error' && (
            <ErrorState title="Comments couldn’t be loaded" message={comments.message} onRetry={() => setReloadKey(k => k + 1)} />
          )}
          {comments.status === 'ready' && (comments.value.length === 0 ? (
            <p className="text-themed-secondary">No comments yet. Finish the bracket and leave one when you pick your champion.</p>
          ) : (
            <ul className="space-y-3 xl:max-h-[800px] xl:overflow-y-auto xl:pr-1">
              {comments.value.map(c => {
                const champion = c.championItemId != null ? itemsById.get(c.championItemId) : undefined;
                return (
                  <li key={c.id} className="card p-4">
                    <div className="mb-2 flex items-baseline justify-between gap-3">
                      <span className="truncate font-semibold text-themed-primary">{c.displayName || 'Anonymous'}</span>
                      <span className="shrink-0 text-xs text-themed-tertiary">{formatDate(c.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-line leading-relaxed text-themed-secondary">{c.comment}</p>
                    {champion && (
                      <p className="mt-3 flex items-center gap-1.5 text-sm text-themed-tertiary">
                        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="var(--accent-primary)" aria-hidden="true">
                          <path d="M6 1h12v4h4v2a5 5 0 01-5 5h-.4A6 6 0 0113 15.9V19h4v3H7v-3h4v-3.1A6 6 0 017.4 12H7a5 5 0 01-5-5V5h4V1zm0 6H4a3 3 0 002.3 2.9A6 6 0 016 8V7zm12 0v1a6 6 0 01-.3 1.9A3 3 0 0020 7h-2z" />
                        </svg>
                        <span className="truncate">Crowned <span className="font-semibold text-themed-secondary">{champion.title}</span></span>
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          ))}
        </section>
      </div>
    </div>
  );
};

const RankingRow: React.FC<{ item: Item; stats?: ItemRanking; index: number }> = ({ item, stats, index }) => {
  const isTop = index === 0;
  return (
    <li className="relative flex items-center gap-3 py-3 pl-2 sm:gap-4">
      {isTop && (
        <span className="absolute bottom-3 left-0 top-3 w-1 rounded-full" style={{ backgroundColor: 'var(--accent-primary)' }} aria-hidden="true" />
      )}
      <span
        className={`w-10 shrink-0 text-right font-display font-black leading-none tabular sm:w-12 ${
          isTop ? 'text-[2.6rem]' : index < 3 ? 'text-[2.1rem] text-themed-primary' : 'text-[1.75rem] text-themed-tertiary'
        }`}
        style={isTop ? { color: 'var(--accent-ink)' } : undefined}
      >
        {index + 1}
      </span>
      <div className="h-14 w-24 shrink-0 overflow-hidden rounded-md bg-themed-tertiary">
        <MediaPreview item={item} size="thumbnail" className="h-full w-full" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className={`truncate font-semibold text-themed-primary ${isTop ? 'text-lg' : ''}`} title={item.title}>{item.title}</h3>
        {stats ? (
          <div className="mt-1.5 flex items-center gap-3">
            <div className="h-1.5 max-w-[14rem] flex-1 overflow-hidden rounded-full bg-themed-tertiary">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(0, Math.min(100, stats.winPercentage))}%`, backgroundColor: isTop ? 'var(--accent-primary)' : 'var(--text-tertiary)' }}
              />
            </div>
            <span className="shrink-0 text-sm text-themed-secondary tabular">
              {stats.winPercentage}% of {stats.totalMatches} {stats.totalMatches === 1 ? 'match' : 'matches'} won
            </span>
          </div>
        ) : (
          <p className="text-sm capitalize text-themed-tertiary">{item.mediaType}</p>
        )}
      </div>
    </li>
  );
};

export default ResultsPage;
