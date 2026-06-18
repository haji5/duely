import React from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { bracketApi } from '../services/api';
import { Bracket, Item, Result, ItemRanking } from '@/types';
import MediaPreview from '../components/MediaPreview';
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
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!bracket) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Bracket not found</h2>
          <Link to="/" className="btn btn-primary">Go Back Home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            {bracket.name} Results
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">{bracket.description}</p>

          {authError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6 max-w-2xl mx-auto">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 mr-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="text-red-800 dark:text-red-200 font-medium">Authentication Error</p>
                  <p className="text-red-700 dark:text-red-300 text-sm mt-1">{authError}</p>
                  <button
                    onClick={() => window.location.reload()}
                    className="mt-2 text-sm text-red-600 dark:text-red-400 hover:underline font-medium"
                  >
                    Refresh Page
                  </button>
                </div>
              </div>
            </div>
          )}

          {!user && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6 max-w-2xl mx-auto">
              <p className="text-blue-800 dark:text-blue-200 text-sm">
                <strong>Session Mode:</strong> Your battle results are stored temporarily.
                Sign in to save your progress permanently and contribute to the global rankings!
              </p>
            </div>
          )}

          <div className="flex justify-center space-x-4">
            <Link to={`/bracket/${id}`} className="btn btn-primary">
              Battle Again
            </Link>
            <Link to="/" className="btn btn-secondary">
              Browse Brackets
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Results Sidebar */}
          <div className="lg:col-span-1">
            <div className="card p-6 sticky top-6 bg-white dark:bg-gray-800 border dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                View Results
              </h3>

              <div className="space-y-3">
                <button
                  onClick={() => setSelectedResult(null)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    !selectedResult 
                      ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border-2 border-primary-200 dark:border-primary-700' 
                      : 'bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <div className="font-medium">🌍 Global Rankings</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {serverRankings.length > 0
                      ? `Server-calculated from all battles`
                      : `From all ${allResults.length} completed battles`
                    }
                  </div>
                </button>

                {personalRanking.length > 0 && (
                  <button
                    onClick={() => setSelectedResult('personal')}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                      selectedResult === 'personal'
                        ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border-2 border-primary-200 dark:border-primary-700' 
                        : 'bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <div className="font-medium">👤 Your Rankings</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Your personal average from {allBattles.length} battles
                      {!user && ' (Session)'}
                    </div>
                  </button>
                )}
              </div>

              {allBattles.length > 0 && (
                <>
                  <hr className="my-4 border-gray-200 dark:border-gray-700" />
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Individual Battles
                    {!user && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 block font-normal">
                        (Session Only)
                      </span>
                    )}
                  </h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {[...allBattles].reverse().slice(0, 10).map((battle, index) => {
                      // Newest battle = highest number (at index 0 after reverse)
                      const battleNumber = allBattles.length - index;
                      return (
                        <button
                          key={getBattleKey(battle)}
                          onClick={() => setSelectedResult(battle)}
                          className={`w-full text-left p-2 rounded-lg transition-colors text-sm ${
                            isSelectedBattle(battle)
                              ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-700' 
                              : 'bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          <div className="font-medium">Battle #{battleNumber}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(battle.createdAt).toLocaleDateString()}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Rankings Display */}
          <div className="lg:col-span-3">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
              {/* Rankings List */}
              <div className={!selectedResult ? "xl:col-span-2" : "xl:col-span-3"}>
                <div className="card p-6 bg-white dark:bg-gray-800 border dark:border-gray-700">
                  <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {!selectedResult ? '🌍 Global Rankings' :
                   selectedResult === 'personal' ? '👤 Your Personal Rankings' :
                   'Individual Battle Results'}
                </h2>
                {selectedResult && selectedResult !== 'personal' && typeof selectedResult === 'object' && (
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {new Date(selectedResult.createdAt).toLocaleString()}
                  </div>
                )}
              </div>

              {/* Show ranking based on selection */}
              {currentRanking.length === 0 ? (
                <div className="text-center py-16">
                  <div className="w-16 h-16 mx-auto mb-6 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                    </svg>
                  </div>
                  <p className="text-gray-500 dark:text-gray-400 text-lg mb-6">
                    {!selectedResult ? 'No global results available yet.' : 'No results to display yet.'}
                  </p>
                  <Link to={`/bracket/${id}`} className="btn btn-primary">
                    {!selectedResult ? 'Be the first to battle!' : 'Start Your First Battle'}
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {currentRanking.map((item, index) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className={`flex items-center space-x-4 p-4 rounded-lg border-2 ${
                        index === 0 
                          ? 'bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 border-yellow-200 dark:border-yellow-800' 
                          : index === 1
                          ? 'bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 border-gray-200 dark:border-gray-600'
                          : index === 2
                          ? 'bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 border-orange-200 dark:border-orange-800'
                          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      {/* Rank */}
                      <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg ${
                        index === 0 
                          ? 'bg-yellow-400 dark:bg-yellow-500 text-white' 
                          : index === 1
                          ? 'bg-gray-400 dark:bg-gray-500 text-white'
                          : index === 2
                          ? 'bg-orange-400 dark:bg-orange-500 text-white'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                      }`}>
                        {index === 0 ? '👑' : index + 1}
                      </div>

                      {/* Media Preview */}
                      <div className="flex-shrink-0">
                        <div className="w-24 h-16 overflow-hidden rounded-lg">
                          <MediaPreview item={item} size="thumbnail" className="w-full h-full scale-75 origin-top-left" />
                        </div>
                      </div>

                      {/* Item Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                          {item.title}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">
                          {item.mediaType}
                        </p>
                        {/* Only show win percentage for aggregated rankings (global/personal), not individual battles */}
                        {(selectedResult === null || selectedResult === 'personal') && hasStats(item) && (
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {item.winPercentage}% wins
                          </p>
                        )}
                      </div>

                      {/* Trophy for winner */}
                      {index === 0 && (
                        <div className="flex-shrink-0 text-3xl ml-4">
                          🏆
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
                </div>
              </div>

              {/* Community Voices (Only shown on Global Rankings) */}
              {!selectedResult && (
                <div className="xl:col-span-1 space-y-4">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                    Community Voices
                  </h2>
                  
                  {allResults.filter(r => r.comment && r.comment.trim() !== '').length === 0 ? (
                    <div className="card p-6 text-center bg-white dark:bg-gray-800 border dark:border-gray-700">
                      <p className="text-gray-500 dark:text-gray-400">No comments yet. Be the first to share your thoughts!</p>
                    </div>
                  ) : (
                    <div className="space-y-4 max-h-[800px] overflow-y-auto pr-2 pb-4">
                      {allResults
                        .filter(r => r.comment && r.comment.trim() !== '')
                        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                        .map(r => {
                          const winner = itemsMap.get(r.ranking[0]);
                          const name = r.displayName || 'Anonymous';
                          
                          return (
                            <motion.div 
                              key={`comment-${r.id}`}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="card p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm"
                            >
                              <div className="flex items-center space-x-3 mb-3">
                                <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-700 dark:text-primary-400 font-bold text-lg border border-primary-200 dark:border-primary-800 shadow-sm">
                                  {name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-semibold text-gray-900 dark:text-white">{name}</div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400">{new Date(r.createdAt).toLocaleDateString()}</div>
                                </div>
                              </div>
                              
                              <p className="text-gray-700 dark:text-gray-300 italic mb-4 leading-relaxed">
                                "{r.comment}"
                              </p>
                              
                              {winner && (
                                <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg flex items-center space-x-3 border border-gray-100 dark:border-gray-600">
                                  <span className="text-xl shrink-0 drop-shadow-sm">🏆</span>
                                  <div className="min-w-0 flex-1">
                                    <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-0.5">Winner</div>
                                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                      {winner.title}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </motion.div>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResultsPage;
