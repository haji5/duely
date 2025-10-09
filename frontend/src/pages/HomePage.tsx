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
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Hero Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center mb-16"
      >
        <h1 className="text-5xl font-bold text-primary mb-6">
          Choose Your Champion
        </h1>
        <p className="text-xl text-secondary max-w-3xl mx-auto mb-8">
          Battle it out in tournament-style brackets! Compare songs, videos, or images head-to-head
          until only one remains victorious. Preview media on hover and watch the competition unfold.
        </p>

        {/* Search Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="max-w-2xl mx-auto mb-8"
        >
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-themed-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearch}
              placeholder="Search for brackets... (Press Enter to search)"
              className="block w-full pl-10 pr-20 py-4 text-lg bg-themed-secondary border-2 border-themed-primary rounded-xl focus:outline-none focus:ring-2 transition-all duration-200 shadow-themed-lg text-themed-primary focus:border-themed-primary"
              style={{
                '--tw-ring-color': 'var(--accent-primary)'
              } as React.CSSProperties}
            />
            <div className="absolute inset-y-0 right-0 flex items-center">
              <button
                onClick={handleSearchClick}
                className="mr-2 px-6 py-2 rounded-lg font-medium transition-colors duration-200"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  color: 'var(--accent-primary-text)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--accent-primary-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--accent-primary)';
                }}
              >
                Search
              </button>
            </div>
          </div>
        </motion.div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => navigate('/create')}
            className="btn btn-primary text-lg px-8 py-4 cursor-pointer"
          >
            Create Custom Bracket
          </button>
          <button
            onClick={() => navigate('/browse')}
            className="btn btn-secondary text-lg px-8 py-4 cursor-pointer"
          >
            Browse All Brackets
          </button>
        </div>
      </motion.div>

      {/* Popular Battles */}
      {popularBrackets.length > 0 && (
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mb-16"
        >
          <h2 className="text-3xl font-bold text-primary mb-8">Popular Battles</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {popularBrackets.slice(0, 6).map((bracket, index) => (
              <motion.div
                key={bracket.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * index }}
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
          transition={{ delay: 0.4 + sectionIndex * 0.1 }}
          className="mb-16"
        >
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-bold text-primary">
              {categorySection.category} Battles
            </h2>
            <Link
              to={`/browse?category=${encodeURIComponent(categorySection.category)}&sort=popular`}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-secondary border border-primary rounded-lg text-secondary hover:bg-tertiary hover:border-secondary transition-all duration-200 shadow-primary hover:shadow-secondary"
            >
              <span className="text-sm font-medium">View More</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {categorySection.brackets.slice(0, 3).map((bracket, index) => (
              <motion.div
                key={bracket.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * index }}
              >
                <BracketCard bracket={bracket} />
              </motion.div>
            ))}
          </div>
        </motion.section>
      ))}

      {/* All Brackets */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-3xl font-bold text-primary">All Brackets</h2>
          <Link
            to="/browse"
            className="inline-flex items-center space-x-2 px-4 py-2 bg-secondary border border-primary rounded-lg text-secondary hover:bg-tertiary hover:border-secondary transition-all duration-200 shadow-primary hover:shadow-secondary"
          >
            <span className="text-sm font-medium">View All</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {brackets.slice(0, 6).map((bracket, index) => (
            <motion.div
              key={bracket.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * index }}
            >
              <BracketCard bracket={bracket} />
            </motion.div>
          ))}
        </div>
      </motion.section>
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
      'music': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      'tv': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      'movies': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      'sports': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      'gaming': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
      'food': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      'travel': 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
      'art': 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
      'technology': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
      'entertainment': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      'general': 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
    };
    return colorMap[categoryLower] || colorMap['general'];
  };

  return (
    <Link to={`/bracket/${bracket.id}`}>
      <div className="card hover:shadow-xl transition-all duration-300 hover:scale-105">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2 text-primary-600">
              {getTypeIcon(bracket.type)}
              <span className="text-sm font-medium capitalize">{bracket.type}</span>
            </div>
            <div className={`px-2 py-1 rounded-full text-xs font-medium ${getCategoryColor(bracket.category)}`}>
              {bracket.category || 'General'}
            </div>
          </div>
          <h3 className="text-xl font-semibold text-primary mb-2">{bracket.name}</h3>
          <p className="text-secondary text-sm mb-4 line-clamp-2">{bracket.description}</p>
          <div className="flex items-center justify-between">
            <span className="text-primary-600 font-medium">Start Battle →</span>
            <div className="text-xs text-tertiary">
              {new Date(bracket.createdAt).toLocaleDateString()}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
};

export default HomePage;
