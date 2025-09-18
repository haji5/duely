import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { bracketApi } from '../services/api';
import { Bracket, Item, Result } from '../types';
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

const ResultsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { getSessionBattlesForBracket } = useSessionBattles();

  const [bracket, setBracket] = React.useState<Bracket | null>(null);
  const [items, setItems] = React.useState<Item[]>([]);
  const [results, setResults] = React.useState<Result[]>([]);
  const [allResults, setAllResults] = React.useState<Result[]>([]);
  const [sessionBattles, setSessionBattles] = React.useState<SessionBattle[]>([]);
  const [loading, setLoading] = React.useState(true);
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

        // Fetch all results for global rankings
        try {
          const allResultsData = await bracketApi.getBracketResults(parseInt(id));
          console.log('Fetched global results:', allResultsData.length, 'results');
          setAllResults(allResultsData);
        } catch (error) {
          console.log('No global results available yet:', error);
          setAllResults([]);
        }

        if (user) {
          // Fetch user's battles from backend
          const resultsData = await bracketApi.getUserBracketResults(parseInt(id), user.uid);
          setResults(resultsData);

          if (resultsData.length > 0) {
            setSelectedResult(resultsData[0]);
          }
        } else {
          // Get session battles from context
          const sessionData = getSessionBattlesForBracket(parseInt(id));
          setSessionBattles(sessionData);

          if (sessionData.length > 0) {
            setSelectedResult(sessionData[0]);
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

  const getRankedItems = (result: Result | SessionBattle): Item[] => {
    if (!result.ranking) return [];

    return result.ranking.map((itemId: number) =>
      items.find(item => item.id === itemId)
    ).filter(Boolean) as Item[];
  };

  const getGlobalAggregatedRanking = (): Item[] => {
    if (allResults.length === 0) return [];

    // Calculate average position for each item across ALL users
    const itemScores: Record<number, { item: Item; totalScore: number; count: number }> = {};

    allResults.forEach(result => {
      result.ranking.forEach((itemId: number, index: number) => {
        const item = items.find(i => i.id === itemId);
        if (item) {
          if (!itemScores[itemId]) {
            itemScores[itemId] = { item, totalScore: 0, count: 0 };
          }
          itemScores[itemId].totalScore += (result.ranking.length - index);
          itemScores[itemId].count += 1;
        }
      });
    });

    // Sort by average score
    return Object.values(itemScores)
      .sort((a, b) => (b.totalScore / b.count) - (a.totalScore / a.count))
      .map(score => score.item);
  };

  const getPersonalAggregatedRanking = (): Item[] => {
    const personalBattles = user ? results : sessionBattles;
    if (personalBattles.length === 0) return [];

    // Calculate average position for each item from personal battles only
    const itemScores: Record<number, { item: Item; totalScore: number; count: number }> = {};

    personalBattles.forEach(result => {
      result.ranking.forEach((itemId: number, index: number) => {
        const item = items.find(i => i.id === itemId);
        if (item) {
          if (!itemScores[itemId]) {
            itemScores[itemId] = { item, totalScore: 0, count: 0 };
          }
          itemScores[itemId].totalScore += (result.ranking.length - index);
          itemScores[itemId].count += 1;
        }
      });
    });

    // Sort by average score
    return Object.values(itemScores)
      .sort((a, b) => (b.totalScore / b.count) - (a.totalScore / a.count))
      .map(score => score.item);
  };

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

  const globalRanking = getGlobalAggregatedRanking();
  const personalRanking = getPersonalAggregatedRanking();
  const allBattles = user ? results : sessionBattles;

  // Fix the currentRanking calculation
  const getCurrentRanking = () => {
    if (selectedResult === 'personal') {
      return personalRanking;
    } else if (selectedResult && typeof selectedResult === 'object') {
      return getRankedItems(selectedResult);
    } else {
      return globalRanking;
    }
  };

  const currentRanking = getCurrentRanking();

  const isSelectedBattle = (battle: Result | SessionBattle) => {
    if (!selectedResult || selectedResult === 'personal') return false;
    if ('id' in battle && 'id' in selectedResult) {
      return battle.id === selectedResult.id;
    }
    if ('sessionId' in battle && 'sessionId' in selectedResult) {
      return battle.sessionId === selectedResult.sessionId;
    }
    return false;
  };

  const getBattleKey = (battle: Result | SessionBattle) => {
    return 'id' in battle ? `result_${battle.id}` : `session_${battle.sessionId}`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            {bracket.name} Results
          </h1>
          <p className="text-gray-600 mb-6">{bracket.description}</p>

          {!user && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 max-w-2xl mx-auto">
              <p className="text-blue-800 text-sm">
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
            <div className="card p-6 sticky top-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                View Results
              </h3>

              <div className="space-y-3">
                <button
                  onClick={() => setSelectedResult(null)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    !selectedResult 
                      ? 'bg-primary-100 text-primary-700 border-2 border-primary-200' 
                      : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  <div className="font-medium">🌍 Global Rankings</div>
                  <div className="text-xs text-gray-500">
                    From all {allResults.length} completed battles
                  </div>
                </button>

                {personalRanking.length > 0 && (
                  <button
                    onClick={() => setSelectedResult('personal')}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                      selectedResult === 'personal'
                        ? 'bg-primary-100 text-primary-700 border-2 border-primary-200' 
                        : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                    }`}
                  >
                    <div className="font-medium">👤 Your Rankings</div>
                    <div className="text-xs text-gray-500">
                      Your personal average from {allBattles.length} battles
                      {!user && ' (Session)'}
                    </div>
                  </button>
                )}
              </div>

              {allBattles.length > 0 && (
                <>
                  <hr className="my-4" />
                  <h4 className="text-sm font-medium text-gray-700 mb-3">
                    Individual Battles
                    {!user && (
                      <span className="text-xs text-gray-500 block font-normal">
                        (Session Only)
                      </span>
                    )}
                  </h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {allBattles.slice(0, 10).map((battle, index) => (
                      <button
                        key={getBattleKey(battle)}
                        onClick={() => setSelectedResult(battle)}
                        className={`w-full text-left p-2 rounded-lg transition-colors text-sm ${
                          isSelectedBattle(battle)
                            ? 'bg-primary-100 text-primary-700 border border-primary-200' 
                            : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                        }`}
                      >
                        <div className="font-medium">Battle #{allBattles.length - index}</div>
                        <div className="text-xs text-gray-500">
                          {new Date(battle.createdAt).toLocaleDateString()}
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Rankings Display */}
          <div className="lg:col-span-3">
            <div className="card p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">
                  {!selectedResult ? '🌍 Global Rankings' :
                   selectedResult === 'personal' ? '👤 Your Personal Rankings' :
                   'Individual Battle Results'}
                </h2>
                {selectedResult && selectedResult !== 'personal' && typeof selectedResult === 'object' && (
                  <div className="text-sm text-gray-500">
                    {new Date(selectedResult.createdAt).toLocaleString()}
                  </div>
                )}
              </div>

              {/* Show ranking based on selection */}
              {currentRanking.length === 0 ? (
                <div className="text-center py-16">
                  <div className="w-16 h-16 mx-auto mb-6 bg-gray-200 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                    </svg>
                  </div>
                  <p className="text-gray-500 text-lg mb-6">
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
                          ? 'bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-200' 
                          : index === 1
                          ? 'bg-gradient-to-r from-gray-50 to-gray-100 border-gray-200'
                          : index === 2
                          ? 'bg-gradient-to-r from-orange-50 to-red-50 border-orange-200'
                          : 'bg-white border-gray-200'
                      }`}
                    >
                      {/* Rank */}
                      <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg ${
                        index === 0 
                          ? 'bg-yellow-400 text-white' 
                          : index === 1
                          ? 'bg-gray-400 text-white'
                          : index === 2
                          ? 'bg-orange-400 text-white'
                          : 'bg-gray-200 text-gray-600'
                      }`}>
                        {index === 0 ? '👑' : index + 1}
                      </div>

                      {/* Media Preview */}
                      <div className="flex-shrink-0">
                        <div className="w-24 h-16 overflow-hidden rounded-lg">
                          <MediaPreview item={item} className="w-full h-full scale-75 origin-top-left" />
                        </div>
                      </div>

                      {/* Item Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold text-gray-900 truncate">
                          {item.title}
                        </h3>
                        <p className="text-sm text-gray-500 capitalize">
                          {item.mediaType}
                        </p>
                      </div>

                      {/* Trophy for winner */}
                      {index === 0 && (
                        <div className="flex-shrink-0">
                          <motion.div
                            animate={{ rotate: [0, 5, -5, 0] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            className="text-yellow-500"
                          >
                            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732L14.146 12.8l-1.179 4.456a1 1 0 01-1.934 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732L9.854 7.2l1.179-4.456A1 1 0 0112 2z" clipRule="evenodd" />
                            </svg>
                          </motion.div>
                        </div>
                      )}
                    </motion.div>
                  ))}
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
