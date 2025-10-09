import React from 'react';
import { motion } from 'framer-motion';
import { bracketApi } from '../services/api';
import { Bracket } from '@/types';
import { Link, useNavigate } from "react-router-dom";

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [brackets, setBrackets] = React.useState<Bracket[]>([]);
  const [popularBrackets, setPopularBrackets] = React.useState<Bracket[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [categorizedBrackets, setCategorizedBrackets] = React.useState<{
    category: string;
    brackets: Bracket[];
  }[]>([]);

  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      navigate(`/browse?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleSearchClick = () => {
    if (searchQuery.trim()) {
      navigate(`/browse?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  React.useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch brackets and popular brackets in parallel (both are cached on backend)
        // - getAllBrackets: Redis cached for 5 minutes
        // - getPopularBrackets: Redis cached for 10 minutes
        const [allBrackets, popular] = await Promise.all([
          bracketApi.getAllBrackets(),
          bracketApi.getPopularBrackets()
        ]);
        setBrackets(allBrackets);
        setPopularBrackets(popular);

        // OPTIMIZATION: Don't fetch results for every bracket on page load!
        // This was causing N+1 API calls and defeating the purpose of caching.
        // Instead, group brackets by category and sort by creation date or use
        // the popularBrackets endpoint which already has engagement data.

        // Group brackets by category (simple, no additional API calls needed)
        const categoryMap = new Map<string, Bracket[]>();
        allBrackets.forEach((bracket) => {
          const category = bracket.category || 'General';
          if (!categoryMap.has(category)) {
            categoryMap.set(category, []);
          }
          categoryMap.get(category)!.push(bracket);
        });

        // Sort categories by the number of brackets in each category
        // and by how many appear in the popular list (indicates engagement)
        const popularIds = new Set(popular.map(b => b.id));

        const categorySections = Array.from(categoryMap.entries())
          .map(([category, brackets]) => {
            // Count how many brackets in this category are popular
            const popularCount = brackets.filter(b => popularIds.has(b.id)).length;
            return {
              category,
              brackets,
              popularCount,
              // Sort brackets within category: popular first, then by date
              sortedBrackets: [...brackets].sort((a, b) => {
                const aPopular = popularIds.has(a.id) ? 1 : 0;
                const bPopular = popularIds.has(b.id) ? 1 : 0;
                if (aPopular !== bPopular) return bPopular - aPopular;
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
              })
            };
          })
          // Sort categories by popularity (those with most popular brackets first)
          .sort((a, b) => {
            if (a.popularCount !== b.popularCount) {
              return b.popularCount - a.popularCount;
            }
            return b.brackets.length - a.brackets.length;
          })
          .map(({ category, sortedBrackets }) => ({
            category,
            brackets: sortedBrackets
          }));

        setCategorizedBrackets(categorySections);
      } catch (error) {
        console.error('Error fetching brackets:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []); // Only run once on mount

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-themed-primary">
        <div className="relative">
          <div className="animate-spin rounded-full h-32 w-32 border-4 border-themed-tertiary border-t-transparent" 
               style={{ borderTopColor: 'var(--accent-primary)' }}></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className="w-12 h-12" style={{ color: 'var(--accent-primary)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-themed-primary">
      {/* Animated Background Gradient - adjusted for light mode */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20 dark:opacity-20">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full rounded-full blur-3xl animate-pulse-slow"
             style={{ background: 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%)' }}></div>
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full rounded-full blur-3xl animate-pulse-slow"
             style={{ background: 'radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 70%)', animationDelay: '1.5s' }}></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
        {/* Hero Section with Gradient */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16 sm:mb-20 lg:mb-24"
        >
          {/* Hero Title with Gradient Text */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.5 }}
          >
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold mb-6 leading-tight">
              <span className="bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 bg-clip-text text-transparent">
                Choose Your Champion
              </span>
            </h1>
          </motion.div>
          
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="text-lg sm:text-xl lg:text-2xl text-themed-secondary max-w-4xl mx-auto mb-10 leading-relaxed px-4"
          >
            Battle it out in tournament-style brackets! Compare songs, videos, or images head-to-head
            until only one remains victorious. Preview media on hover and watch the competition unfold.
          </motion.p>

          {/* Enhanced Search Bar */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="max-w-3xl mx-auto mb-10 px-4"
          >
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 rounded-2xl blur opacity-20 group-hover:opacity-30 dark:opacity-25 dark:group-hover:opacity-40 transition duration-300"></div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                  <svg className="h-6 w-6 text-themed-tertiary transition-colors group-focus-within:text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearch}
                  placeholder="Search for brackets... (Press Enter to search)"
                  className="block w-full pl-14 pr-32 py-5 text-lg bg-themed-secondary border-2 border-themed-primary rounded-xl focus:outline-none focus:ring-2 transition-all duration-200 shadow-themed-lg text-themed-primary focus:border-purple-500"
                  style={{
                    '--tw-ring-color': 'rgba(147, 51, 234, 0.3)'
                  } as React.CSSProperties}
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                  <button
                    onClick={handleSearchClick}
                    className="px-6 py-2.5 rounded-lg font-semibold transition-all duration-200 transform hover:scale-105 shadow-lg"
                    style={{
                      backgroundColor: 'var(--accent-primary)',
                      color: 'var(--accent-primary-text)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--accent-primary-hover)';
                      e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(99, 102, 241, 0.4)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--accent-primary)';
                      e.currentTarget.style.boxShadow = '';
                    }}
                  >
                    Search
                  </button>
                </div>
              </div>
            </div>
          </motion.div>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="flex flex-col sm:flex-row gap-4 sm:gap-6 justify-center items-center px-4"
          >
            <button
              onClick={() => navigate('/create')}
              className="group relative w-full sm:w-auto px-8 py-4 text-lg font-bold rounded-xl overflow-hidden transition-all duration-300 transform hover:scale-105 shadow-xl hover:shadow-2xl"
              style={{
                backgroundColor: 'var(--accent-primary)',
                color: 'var(--accent-primary-text)'
              }}
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create Custom Bracket
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </button>
            <button
              onClick={() => navigate('/browse')}
              className="w-full sm:w-auto px-8 py-4 text-lg font-bold rounded-xl border-2 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl bg-themed-secondary text-themed-primary"
              style={{
                borderColor: 'var(--accent-primary)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--accent-primary)';
                e.currentTarget.style.color = 'var(--accent-primary-text)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                Browse All Brackets
              </span>
            </button>
          </motion.div>
        </motion.div>

        {/* Popular Battles with Enhanced Cards */}
        {popularBrackets.length > 0 && (
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mb-20"
          >
            <div className="flex items-center justify-between mb-10">
              <div>
                <h2 className="text-3xl sm:text-4xl font-bold text-themed-primary mb-2 flex items-center gap-3">
                  <span className="text-4xl">🔥</span>
                  <span className="bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                    Popular Battles
                  </span>
                </h2>
                <p className="text-themed-secondary">Trending battles everyone is playing</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
              {popularBrackets.slice(0, 6).map((bracket, index) => (
                <motion.div
                  key={bracket.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * index, duration: 0.5 }}
                >
                  <BracketCard bracket={bracket} />
                </motion.div>
              ))}
            </div>
          </motion.section>
        )}

        {/* Category Sections */}
        {categorizedBrackets.map((categorySection, sectionIndex) => (
          <motion.section
            key={categorySection.category}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 + sectionIndex * 0.1 }}
            className="mb-20"
          >
            <div className="flex items-center justify-between mb-8 sm:mb-10">
              <div>
                <h2 className="text-3xl sm:text-4xl font-bold text-themed-primary mb-2">
                  {categorySection.category} Battles
                </h2>
                <p className="text-themed-secondary">Explore {categorySection.category.toLowerCase()} brackets</p>
              </div>
              <Link
                to={`/browse?category=${encodeURIComponent(categorySection.category)}&sort=popular`}
                className="group hidden sm:flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold transition-all duration-200 hover:scale-105 shadow-md hover:shadow-lg bg-themed-secondary border-2 text-themed-primary"
                style={{
                  borderColor: 'var(--border-primary)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--accent-primary)';
                  e.currentTarget.style.borderColor = 'var(--accent-primary)';
                  e.currentTarget.style.color = 'var(--accent-primary-text)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                  e.currentTarget.style.borderColor = 'var(--border-primary)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }}
              >
                <span>View More</span>
                <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
              {categorySection.brackets.slice(0, 3).map((bracket, index) => (
                <motion.div
                  key={bracket.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * index, duration: 0.5 }}
                >
                  <BracketCard bracket={bracket} />
                </motion.div>
              ))}
            </div>
            <Link
              to={`/browse?category=${encodeURIComponent(categorySection.category)}&sort=popular`}
              className="sm:hidden flex items-center justify-center gap-2 px-5 py-3 mt-6 rounded-lg font-semibold transition-all duration-200 shadow-md bg-themed-secondary border-2 text-themed-primary"
              style={{
                borderColor: 'var(--accent-primary)'
              }}
            >
              <span>View More {categorySection.category}</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </motion.section>
        ))}

        {/* All Brackets Section */}
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          <div className="flex items-center justify-between mb-8 sm:mb-10">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-themed-primary mb-2">All Brackets</h2>
              <p className="text-themed-secondary">Discover all available brackets</p>
            </div>
            <Link
              to="/browse"
              className="group hidden sm:flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold transition-all duration-200 hover:scale-105 shadow-md hover:shadow-lg bg-themed-secondary border-2 text-themed-primary"
              style={{
                borderColor: 'var(--border-primary)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--accent-primary)';
                e.currentTarget.style.borderColor = 'var(--accent-primary)';
                e.currentTarget.style.color = 'var(--accent-primary-text)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                e.currentTarget.style.borderColor = 'var(--border-primary)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
            >
              <span>View All</span>
              <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {brackets.slice(0, 6).map((bracket, index) => (
              <motion.div
                key={bracket.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * index, duration: 0.5 }}
              >
                <BracketCard bracket={bracket} />
              </motion.div>
            ))}
          </div>
          <Link
            to="/browse"
            className="sm:hidden flex items-center justify-center gap-2 px-5 py-3 mt-6 rounded-lg font-semibold transition-all duration-200 shadow-md bg-themed-secondary border-2 text-themed-primary"
            style={{
              borderColor: 'var(--accent-primary)'
            }}
          >
            <span>View All Brackets</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </motion.section>
      </div>
    </div>
  );
};

const BracketCard: React.FC<{ bracket: Bracket }> = ({ bracket }) => {
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'song':
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
        );
      case 'video':
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        );
      case 'image':
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        );
      default:
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        );
    }
  };

  const getCategoryColor = (category: string) => {
    const categoryLower = category?.toLowerCase() || 'general';
    const colorMap: { [key: string]: string } = {
      'music': 'bg-gradient-to-r from-purple-500 to-pink-500 text-white',
      'tv': 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white',
      'movies': 'bg-gradient-to-r from-red-500 to-orange-500 text-white',
      'sports': 'bg-gradient-to-r from-green-500 to-emerald-500 text-white',
      'gaming': 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white',
      'food': 'bg-gradient-to-r from-orange-500 to-yellow-500 text-white',
      'travel': 'bg-gradient-to-r from-teal-500 to-cyan-500 text-white',
      'art': 'bg-gradient-to-r from-pink-500 to-rose-500 text-white',
      'technology': 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white',
      'entertainment': 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white',
      'general': 'bg-gradient-to-r from-gray-500 to-gray-600 text-white dark:from-gray-600 dark:to-gray-700'
    };
    return colorMap[categoryLower] || colorMap['general'];
  };

  return (
    <Link to={`/bracket/${bracket.id}`} className="block group h-full">
      <div className="relative h-full bg-themed-secondary rounded-2xl border-2 border-themed-primary overflow-hidden transition-all duration-300 hover:scale-105 hover:shadow-2xl">
        {/* Gradient overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/0 via-indigo-500/0 to-blue-500/0 group-hover:from-purple-500/10 group-hover:via-indigo-500/10 group-hover:to-blue-500/10 transition-all duration-300 pointer-events-none z-10"></div>

        <div className="relative p-6 sm:p-7 h-full flex flex-col z-10">
          {/* Type and Category */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-themed-tertiary">
              <div style={{ color: 'var(--accent-primary)' }}>
                {getTypeIcon(bracket.type)}
              </div>
              <span className="text-sm font-semibold capitalize text-themed-primary">{bracket.type}</span>
            </div>
            <div className={`px-3 py-1.5 rounded-full text-xs font-bold shadow-md ${getCategoryColor(bracket.category)}`}>
              {bracket.category || 'General'}
            </div>
          </div>

          {/* Title and Description */}
          <h3 className="text-xl sm:text-2xl font-bold text-themed-primary mb-3 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors duration-200">
            {bracket.name}
          </h3>
          <p className="text-themed-secondary text-sm sm:text-base mb-6 line-clamp-2 flex-grow">
            {bracket.description}
          </p>

          {/* Footer */}
          <div className="flex items-center justify-between mt-auto pt-4 border-t border-themed-primary">
            <div className="flex items-center gap-2 font-semibold transition-all duration-200 group-hover:gap-3" style={{ color: 'var(--accent-primary)' }}>
              <span>Start Battle</span>
              <svg className="w-5 h-5 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>
            <div className="flex items-center gap-2 text-xs text-themed-tertiary">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>{new Date(bracket.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
};

export default HomePage;
