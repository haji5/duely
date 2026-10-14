import React from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import MediaPreview from '../components/MediaPreview';
import { PageLoader, TypeIcon, formatDate } from '../components/BracketCard';
import { bracketApi } from '../services/api';
import { Bracket, Item, Result, ItemRanking } from '@/types';
import { useAuth } from '../contexts/AuthContext';
import { useSessionBattles } from '../contexts/SessionBattleContext';

interface SessionBattle {
  sessionId: string;
  bracketId: number;
  bracketName: string;
  ranking: number[];
  createdAt: Date;
}

interface ItemWithStats extends Item {
  wins: number;
  totalMatches: number;
  winPercentage: number;
}

const ResultsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { getSessionBattlesForBracket } = useSessionBattles();
  const [searchParams] = useSearchParams();

  const [bracket, setBracket] = React.useState<Bracket | null>(null);
  const [items, setItems] = React.useState<Item[]>([]);
  const [results, setResults] = React.useState<Result[]>([]);
  const [allResults, setAllResults] = React.useState<Result[]>([]);
  const [serverRankings, setServerRankings] = React.useState<ItemRanking[]>([]);
  const [sessionBattles, setSessionBattles] = React.useState<SessionBattle[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [selectedResult, setSelectedResult] = React.useState<Result | SessionBattle | 'personal' | null>(null);

  React.useEffect(() => {
    const fetchData = async () => {
      if (!id) return;

      try {
        const [bracketData, itemsData] = await Promise.all([
          bracketApi.getBracket(parseInt(id)),
          bracketApi.getBracketItems(parseInt(id))
        ]);

        setBracket(bracketData);
        setItems(itemsData);

        // Fetch server-calculated rankings first (preferred method)
        try {
          const rankings = await bracketApi.getBracketRankings(parseInt(id));
          console.log('Fetched server-calculated rankings:', rankings.length, 'items');
          setServerRankings(rankings);
        } catch (error) {
          console.log('Server rankings not available, falling back to client-side calculation:', error);
        }

        // Always fetch global results because we need them for the Community Voices comments section
        try {
          const allResultsData = await bracketApi.getBracketResults(parseInt(id));
          console.log('Fetched global results for comments:', allResultsData.length, 'results');
          setAllResults(allResultsData);
        } catch (error) {
          console.log('No global results available yet:', error);
          setAllResults([]);
        }

        if (user) {
          // Fetch user's battles from backend with proper error handling
          try {
            const resultsData = await bracketApi.getUserBracketResults(parseInt(id), user.uid);
            // Sort by createdAt to ensure newest battles are last in array
            const sortedResults = resultsData.sort((a, b) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );
            setResults(sortedResults);

            // Set default selection based on how user arrived at this page
            if (searchParams.get('fromBattle') === 'true' && sortedResults.length > 0) {
              // Coming from completed battle - show the newest battle (last in sorted array)
              setSelectedResult(sortedResults[sortedResults.length - 1]);
            } else if (sortedResults.length > 0) {
              // Coming from bracket selection - keep global rankings (null)
              setSelectedResult(null);
            }
          } catch (error: any) {
            // Handle authentication errors properly
            if (error?.response?.status === 403 || error?.response?.status === 401) {
              console.warn('Authentication error fetching user results:', error);
              setAuthError('Authentication failed. Please refresh the page to reload your results.');
              setResults([]);
            } else if (error?.message?.includes('Unauthorized')) {
              // Client-side validation error from api.ts
              console.error('Client-side auth validation failed:', error);
              setAuthError('Security error: Cannot load results. Please sign in again.');
              setResults([]);
            } else {
              console.error('Error fetching user results:', error);
              setResults([]);
            }
          }
        } else {
          // Get session battles from context (already sorted newest first by the context)
          const sessionData = getSessionBattlesForBracket(parseInt(id));
          // Reverse to match user data ordering (oldest first, newest last)
          const sortedSessionData = [...sessionData].reverse();
          setSessionBattles(sortedSessionData);

          // Set default selection based on how user arrived at this page
          if (searchParams.get('fromBattle') === 'true' && sortedSessionData.length > 0) {
            // Coming from completed battle - show the newest battle (last in array)
            setSelectedResult(sortedSessionData[sortedSessionData.length - 1]);
          } else if (sortedSessionData.length > 0) {
            // Coming from bracket selection - keep global rankings (null)
            setSelectedResult(null);
          }
        }
      } catch (error) {
        console.error('Error fetching results:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, user, getSessionBattlesForBracket]);

  // IMPORTANT: All hooks must be called before any conditional returns
  // This is a React rule - hooks must be called in the same order every render

  // Optimize item lookups with a Map for O(1) access instead of O(n)
  const itemsMap = React.useMemo(() =>
    new Map(items.map(item => [item.id, item])),
  [items]);

  const getRankedItems = React.useCallback((result: Result | SessionBattle): Item[] => {
    if (!result.ranking) return [];
    return result.ranking
      .map((itemId: number) => itemsMap.get(itemId))
      .filter(Boolean) as Item[];
  }, [itemsMap]);

  const globalRanking = React.useMemo(() => {
    if (serverRankings.length > 0) {
      return serverRankings.map(ranking => ({
        ...ranking.item,
        wins: ranking.wins,
        totalMatches: ranking.totalMatches,
        winPercentage: ranking.winPercentage
      }));
    }

    if (allResults.length === 0) return [];

    const itemScores: Record<number, { item: Item; totalScore: number; count: number; wins: number; totalMatches: number }> = {};

    allResults.forEach(result => {
      result.ranking.forEach((itemId: number, index: number) => {
        const item = items.find(i => i.id === itemId);
        if (item) {
          if (!itemScores[itemId]) {
            itemScores[itemId] = { item, totalScore: 0, count: 0, wins: 0, totalMatches: 0 };
          }
          itemScores[itemId].totalScore += (result.ranking.length - index);
          itemScores[itemId].count += 1;

          result.ranking.forEach((otherItemId: number, otherIndex: number) => {
            if (itemId !== otherItemId) {
              itemScores[itemId].totalMatches += 1;
              if (index < otherIndex) {
                itemScores[itemId].wins += 1;
              }
            }
          });
        }
      });
    });

    return Object.values(itemScores)
      .sort((a, b) => (b.totalScore / b.count) - (a.totalScore / a.count))
      .map(score => ({
        ...score.item,
        wins: score.wins,
        totalMatches: score.totalMatches,
        winPercentage: score.totalMatches > 0 ? Math.round((score.wins / score.totalMatches) * 100) : 0
      }));
  }, [serverRankings, allResults, items]);

  const personalRanking = React.useMemo(() => {
    const personalBattles = user ? results : sessionBattles;
    if (personalBattles.length === 0) return [];

    const itemScores: Record<number, { item: Item; totalScore: number; count: number; wins: number; totalMatches: number }> = {};

    personalBattles.forEach(result => {
      result.ranking.forEach((itemId: number, index: number) => {
        const item = items.find(i => i.id === itemId);
        if (item) {
          if (!itemScores[itemId]) {
            itemScores[itemId] = { item, totalScore: 0, count: 0, wins: 0, totalMatches: 0 };
          }
          itemScores[itemId].totalScore += (result.ranking.length - index);
          itemScores[itemId].count += 1;

          result.ranking.forEach((otherItemId: number, otherIndex: number) => {
            if (itemId !== otherItemId) {
              itemScores[itemId].totalMatches += 1;
              if (index < otherIndex) {
                itemScores[itemId].wins += 1;
              }
            }
          });
        }
      });
    });

    return Object.values(itemScores)
      .sort((a, b) => (b.totalScore / b.count) - (a.totalScore / a.count))
      .map(score => ({
        ...score.item,
        wins: score.wins,
        totalMatches: score.totalMatches,
        winPercentage: score.totalMatches > 0 ? Math.round((score.wins / score.totalMatches) * 100) : 0
      }));
  }, [results, sessionBattles, items, user]);

  const allBattles = user ? results : sessionBattles;

  const getCurrentRanking = React.useCallback((): (ItemWithStats | Item)[] => {
    if (selectedResult === 'personal') {
      return personalRanking;
    } else if (selectedResult && typeof selectedResult === 'object') {
      return getRankedItems(selectedResult);
    } else {
      return globalRanking;
    }
  }, [selectedResult, personalRanking, globalRanking, getRankedItems]);

  const currentRanking = getCurrentRanking();

  const hasStats = React.useCallback((item: ItemWithStats | Item): item is ItemWithStats => {
    return 'winPercentage' in item;
  }, []);

  const isSelectedBattle = React.useCallback((battle: Result | SessionBattle) => {
    if (!selectedResult || selectedResult === 'personal') return false;
    if ('id' in battle && 'id' in selectedResult) {
      return battle.id === selectedResult.id;
    }
    if ('sessionId' in battle && 'sessionId' in selectedResult) {
      return battle.sessionId === selectedResult.sessionId;
    }
    return false;
  }, [selectedResult]);

  const getBattleKey = React.useCallback((battle: Result | SessionBattle) => {
    return 'id' in battle ? `result_${battle.id}` : `session_${battle.sessionId}`;
  }, []);

  // NOW we can do conditional returns AFTER all hooks have been called
  if (loading) {
    return <PageLoader label="Loading results" />;
  }

  if (!bracket) {
    return (
      <div className="page flex min-h-[60vh] flex-col items-start justify-center py-16">
        <h1 className="font-display text-[2.75rem] font-black leading-none">Bracket not found</h1>
        <p className="mt-3 text-lg text-themed-secondary">It may have been removed, or the link is wrong.</p>
        <Link to="/browse" className="btn btn-primary mt-8">Browse brackets</Link>
      </div>
    );
  }

  const isAggregate = selectedResult === null || selectedResult === 'personal';
  const comments = allResults
    .filter(r => r.comment && r.comment.trim() !== '')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const rankingTitle = !selectedResult
    ? 'Everyone’s ranking'
    : selectedResult === 'personal'
      ? 'Your ranking'
      : 'Your run';

  return (
    <div className="page pb-24 pt-10 sm:pt-14">
      {/* Header */}
      <header className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-themed-secondary">
            <TypeIcon type={bracket.type} />
            Results
          </p>
          <h1 className="font-display text-[2.75rem] font-black leading-[0.95] text-themed-primary sm:text-[3.5rem]">
            {bracket.name}
          </h1>
          {bracket.description && <p className="mt-3 max-w-2xl text-lg text-themed-secondary">{bracket.description}</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          <Link to={`/bracket/${id}`} className="btn btn-primary">
            Play again
          </Link>
          <Link to="/browse" className="btn btn-secondary">
            Browse brackets
          </Link>
        </div>
      </header>

      {authError && (
        <div className="notice notice-error mb-4 max-w-3xl" role="alert">
          <p className="font-semibold text-themed-primary">Your results couldn’t be loaded</p>
          <p className="mt-0.5">{authError}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 font-semibold text-themed-primary underline underline-offset-4"
          >
            Refresh page
          </button>
        </div>
      )}

      {!user && (
        <div className="notice notice-info mb-8 max-w-3xl">
          You’re playing as a guest. Your picks count toward everyone’s ranking, but your own history
          only lasts until you close this tab. Sign in to keep it.
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-[13rem_minmax(0,1fr)_18rem]">
        {/* View switcher */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <h2 className="mb-2 text-sm font-semibold text-themed-tertiary">Show</h2>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            <button
              onClick={() => setSelectedResult(null)}
              aria-pressed={!selectedResult}
              className="choice"
            >
              <span className="block text-themed-primary">Everyone</span>
              <span className="block text-xs font-medium text-themed-tertiary">
                {serverRankings.length > 0
                  ? 'All completed brackets'
                  : `${allResults.length} completed ${allResults.length === 1 ? 'bracket' : 'brackets'}`}
              </span>
            </button>

            {personalRanking.length > 0 && (
              <button
                onClick={() => setSelectedResult('personal')}
                aria-pressed={selectedResult === 'personal'}
                className="choice"
              >
                <span className="block text-themed-primary">You</span>
                <span className="block text-xs font-medium text-themed-tertiary">
                  Average of your {allBattles.length} {allBattles.length === 1 ? 'run' : 'runs'}
                  {!user && ', this session'}
                </span>
              </button>
            )}
          </div>

          {allBattles.length > 0 && (
            <>
              <h2 className="mb-2 mt-6 text-sm font-semibold text-themed-tertiary">
                Your runs{!user && ' this session'}
              </h2>
              <div className="flex gap-2 overflow-x-auto pb-1 lg:max-h-72 lg:flex-col lg:overflow-y-auto lg:overflow-x-visible lg:pb-0">
                {[...allBattles].reverse().slice(0, 10).map((battle, index) => {
                  // Newest battle = highest number (at index 0 after reverse)
                  const battleNumber = allBattles.length - index;
                  return (
                    <button
                      key={getBattleKey(battle)}
                      onClick={() => setSelectedResult(battle)}
                      aria-pressed={isSelectedBattle(battle)}
                      className="choice shrink-0 py-1.5 text-sm"
                    >
                      <span className="block text-themed-primary">Run {battleNumber}</span>
                      <span className="block text-xs font-medium text-themed-tertiary">
                        {formatDate(String(battle.createdAt))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </aside>

        {/* Rankings */}
        <section className={selectedResult ? 'xl:col-span-2' : ''} aria-labelledby="ranking-title">
          <div className="mb-4 flex items-baseline justify-between gap-4 border-b border-themed-primary pb-3">
            <h2 id="ranking-title" className="font-display text-[2rem] font-extrabold leading-none text-themed-primary">
              {rankingTitle}
            </h2>
            {selectedResult && selectedResult !== 'personal' && typeof selectedResult === 'object' && (
              <span className="text-sm text-themed-tertiary">
                {new Date(selectedResult.createdAt).toLocaleString()}
              </span>
            )}
          </div>

          {currentRanking.length === 0 ? (
            <div className="card flex flex-col items-start px-6 py-12">
              <h3 className="font-display text-2xl font-extrabold">No results yet</h3>
              <p className="mt-1 text-themed-secondary">
                {!selectedResult
                  ? 'Nobody has finished this bracket yet. Play it and yours will be the first.'
                  : 'Finish a run of this bracket to see your ranking here.'}
              </p>
              <Link to={`/bracket/${id}`} className="btn btn-primary mt-6">
                Play this bracket
              </Link>
            </div>
          ) : (
            <ol className="divide-y divide-[color:var(--border-primary)]">
              {currentRanking.map((item, index) => {
                const isTop = index === 0;
                return (
                  <li
                    key={item.id}
                    className="relative flex items-center gap-3 py-3 pl-2 sm:gap-4"
                  >
                    {isTop && (
                      <span className="absolute left-0 top-3 bottom-3 w-1 rounded-full" style={{ backgroundColor: 'var(--accent-primary)' }} aria-hidden="true" />
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
                      <h3 className={`truncate font-semibold text-themed-primary ${isTop ? 'text-lg' : ''}`} title={item.title}>
                        {item.title}
                      </h3>
                      {isAggregate && hasStats(item) ? (
                        <div className="mt-1.5 flex items-center gap-3">
                          <div className="h-1.5 max-w-[14rem] flex-1 overflow-hidden rounded-full bg-themed-tertiary">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.max(0, Math.min(100, item.winPercentage))}%`,
                                backgroundColor: isTop ? 'var(--accent-primary)' : 'var(--text-tertiary)'
                              }}
                            />
                          </div>
                          <span className="shrink-0 text-sm text-themed-secondary tabular">
                            {item.winPercentage}% of matchups won
                          </span>
                        </div>
                      ) : (
                        <p className="text-sm capitalize text-themed-tertiary">{item.mediaType}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {/* Comments (only alongside everyone's ranking) */}
        {!selectedResult && (
          <section className="lg:col-start-2 xl:col-start-auto" aria-labelledby="comments-title">
            <h2 id="comments-title" className="mb-4 border-b border-themed-primary pb-3 font-display text-[2rem] font-extrabold leading-none text-themed-primary">
              What people said
            </h2>

            {comments.length === 0 ? (
              <p className="text-themed-secondary">
                No comments yet. Finish the bracket and leave one when you pick your champion.
              </p>
            ) : (
              <ul className="space-y-3 xl:max-h-[800px] xl:overflow-y-auto xl:pr-1">
                {comments.map(r => {
                  const winner = itemsMap.get(r.ranking[0]);
                  const name = r.displayName || 'Anonymous';

                  return (
                    <li key={`comment-${r.id}`} className="card p-4">
                      <div className="mb-2 flex items-baseline justify-between gap-3">
                        <span className="truncate font-semibold text-themed-primary">{name}</span>
                        <span className="shrink-0 text-xs text-themed-tertiary">{formatDate(r.createdAt)}</span>
                      </div>
                      <p className="leading-relaxed text-themed-secondary">{r.comment}</p>
                      {winner && (
                        <p className="mt-3 flex items-center gap-1.5 text-sm text-themed-tertiary">
                          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="var(--accent-primary)" aria-hidden="true">
                            <path d="M6 1h12v4h4v2a5 5 0 01-5 5h-.4A6 6 0 0113 15.9V19h4v3H7v-3h4v-3.1A6 6 0 017.4 12H7a5 5 0 01-5-5V5h4V1zm0 6H4a3 3 0 002.3 2.9A6 6 0 016 8V7zm12 0v1a6 6 0 01-.3 1.9A3 3 0 0020 7h-2z" />
                          </svg>
                          <span className="truncate">
                            Crowned <span className="font-semibold text-themed-secondary">{winner.title}</span>
                          </span>
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
};

export default ResultsPage;
