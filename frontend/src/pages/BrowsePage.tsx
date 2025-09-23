import React from 'react';
import { motion } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import { bracketApi } from '../services/api';
import type { Bracket } from '@/types';

const BrowsePage: React.FC = () => {
  const location = useLocation();
  const [brackets, setBrackets] = React.useState<Bracket[]>([]);
  const [filteredBrackets, setFilteredBrackets] = React.useState<Bracket[]>([]);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedType, setSelectedType] = React.useState<string>('all');
  const [sortBy, setSortBy] = React.useState<string>('newest');
  const [creatorFilter, setCreatorFilter] = React.useState<string>('');
  const [loading, setLoading] = React.useState(true);

  // Initialize search query and creator filter from URL parameters
  React.useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const query = searchParams.get('search');
    const creator = searchParams.get('creator');
    if (query) {
      setSearchQuery(query);
    }
    if (creator) {
      setCreatorFilter(creator);
    }
  }, [location.search]);

  React.useEffect(() => {
    const fetchBrackets = async () => {
      try {
        const allBrackets = await bracketApi.getAllBrackets();
        setBrackets(allBrackets);
        setFilteredBrackets(allBrackets);
      } catch (error) {
        console.error('Error fetching brackets:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBrackets();
  }, []);

  React.useEffect(() => {
    let filtered = brackets;

    // Filter by search query
    if (searchQuery.trim()) {
      filtered = filtered.filter(bracket =>
        bracket.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        bracket.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by creator
    if (creatorFilter) {
      filtered = filtered.filter(bracket => bracket.createdBy === creatorFilter);
    }

    // Filter by type
    if (selectedType !== 'all') {
      filtered = filtered.filter(bracket => bracket.type === selectedType);
    }

    // Sort the filtered results
    filtered = sortBrackets(filtered, sortBy);

    setFilteredBrackets(filtered);
  }, [searchQuery, selectedType, brackets, sortBy, creatorFilter]);

  const sortBrackets = (brackets: Bracket[], sortOption: string): Bracket[] => {
    const sortedBrackets = [...brackets];

    switch (sortOption) {
      case 'newest':
        return sortedBrackets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      case 'oldest':
        return sortedBrackets.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      case 'name-asc':
        return sortedBrackets.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      case 'name-desc':
        return sortedBrackets.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
      case 'type':
        return sortedBrackets.sort((a, b) => (a.type || '').localeCompare(b.type || ''));
      default:
        return sortedBrackets;
    }
  };

  const getSortOptions = () => [
    { value: 'newest', label: 'Newest First' },
    { value: 'oldest', label: 'Oldest First' },
    { value: 'name-asc', label: 'Name A-Z' },
    { value: 'name-desc', label: 'Name Z-A' },
    { value: 'type', label: 'Type' }
  ];

  const getUniqueTypes = () => {
    const types = brackets.map(bracket => bracket.type).filter(Boolean);
    return Array.from(new Set(types));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-primary">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl font-bold text-primary mb-4">
            {creatorFilter ? 'My Brackets' : 'Browse All Brackets'}
          </h1>
          <p className="text-xl text-secondary max-w-3xl mx-auto mb-8">
            {creatorFilter
              ? 'View and manage all the bracket battles you have created.'
              : 'Discover all available bracket battles. Search by name or filter by type to find your perfect competition.'
            }
          </p>
        </motion.div>

        {/* Search and Filter Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-themed-secondary rounded-lg shadow-themed-lg border border-themed-primary p-6 mb-8"
        >
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search Input */}
            <div className="flex-1 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-themed-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search brackets by name or description..."
                className="block w-full pl-10 pr-3 py-3 bg-themed-secondary border border-themed-primary rounded-lg focus:outline-none focus:ring-2 transition-all duration-200 text-themed-primary"
                style={{
                  '--tw-ring-color': 'var(--accent-primary)'
                } as React.CSSProperties}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Type Filter */}
            <div className="md:w-48">
              <select
                className="block w-full px-3 py-3 bg-themed-secondary border border-themed-primary rounded-lg focus:outline-none focus:ring-2 transition-all duration-200 text-themed-primary"
                style={{
                  '--tw-ring-color': 'var(--accent-primary)'
                } as React.CSSProperties}
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
              >
                <option value="all">All Types</option>
                {getUniqueTypes().map(type => (
                  <option key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}s
                  </option>
                ))}
              </select>
            </div>

            {/* Sort By */}
            <div className="md:w-48">
              <select
                className="block w-full px-3 py-3 bg-themed-secondary border border-themed-primary rounded-lg focus:outline-none focus:ring-2 transition-all duration-200 text-themed-primary"
                style={{
                  '--tw-ring-color': 'var(--accent-primary)'
                } as React.CSSProperties}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                {getSortOptions().map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Results Count */}
          <div className="mt-4 text-sm text-themed-secondary">
            Showing {filteredBrackets.length} of {brackets.length} brackets
            {searchQuery && (
              <span> for "{searchQuery}"</span>
            )}
            {selectedType !== 'all' && (
              <span> in {selectedType}s</span>
            )}
          </div>
        </motion.div>

        {/* Brackets Grid */}
        {filteredBrackets.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-center py-16"
          >
            <div className="w-24 h-24 mx-auto mb-6 bg-tertiary rounded-full flex items-center justify-center">
              <svg className="w-12 h-12 text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0112 15c-2.34 0-4.29-1.009-5.824-2.562M15 9.34c.47-.258.995-.398 1.541-.398 2.209 0 4 1.791 4 4s-1.791 4-4 4c-.546 0-1.071-.14-1.541-.398M9 9.34c-.47-.258-.995-.398-1.541-.398-2.209 0-4 1.791-4 4s1.791 4 4 4c.546 0 1.071.14 1.541.398" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-primary mb-2">No brackets found</h3>
            <p className="text-secondary mb-6">
              {searchQuery || selectedType !== 'all'
                ? 'Try adjusting your search or filter criteria.'
                : 'No brackets are available at the moment.'}
            </p>
            {(searchQuery || selectedType !== 'all') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedType('all');
                }}
                className="btn btn-secondary"
              >
                Clear Filters
              </button>
            )}
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {filteredBrackets.map((bracket, index) => (
              <motion.div
                key={bracket.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * (index % 9) }}
              >
                <BracketCard bracket={bracket} />
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Back to Home */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center mt-12"
        >
          <Link to="/" className="btn btn-secondary">
            ← Back to Home
          </Link>
        </motion.div>
      </div>
    </div>
  );
};

const BracketCard: React.FC<{ bracket: Bracket }> = ({ bracket }) => {
  return (
    <Link to={`/bracket/${bracket.id}`}>
      <div className="card hover:shadow-xl transition-all duration-300 hover:scale-105">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2 text-primary-600">
              {/* Type Icon */}
              {(() => {
                switch (bracket.type) {
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
              })()}
              <span className="text-sm font-medium capitalize">{bracket.type}</span>
            </div>
            <div className="bg-tertiary text-secondary px-2 py-1 rounded-full text-xs">
              Battle
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

export default BrowsePage;
