import React from 'react';
import BracketCard, { PageLoader, typeLabel } from '../components/BracketCard';
import { Link, useLocation } from 'react-router-dom';
import { bracketApi } from '../services/api';
import type { Bracket } from '@/types';
import { useDebounce } from '@/utils/debounce';

const BrowsePage: React.FC = () => {
  const location = useLocation();
  const [brackets, setBrackets] = React.useState<Bracket[]>([]);
  const [filteredBrackets, setFilteredBrackets] = React.useState<Bracket[]>([]);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedType, setSelectedType] = React.useState<string>('all');
  const [selectedCategory, setSelectedCategory] = React.useState<string>('all');
  const [sortBy, setSortBy] = React.useState<string>('newest');
  const [creatorFilter, setCreatorFilter] = React.useState<string>('');
  const [loading, setLoading] = React.useState(true);

  // Debounce search query to prevent excessive filtering
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Initialize search query and creator filter from URL parameters
  React.useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const query = searchParams.get('search');
    const creator = searchParams.get('creator');
    const category = searchParams.get('category');
    const sort = searchParams.get('sort');
    if (query) {
      setSearchQuery(query);
    }
    if (creator) {
      setCreatorFilter(creator);
    }
    if (category) {
      setSelectedCategory(category);
    }
    if (sort) {
      setSortBy(sort);
    }
  }, [location.search]);

  React.useEffect(() => {
    const fetchBrackets = async () => {
      try {
        let allBrackets: Bracket[];

        // If viewing "My Brackets", fetch directly without cache for immediate visibility
        if (creatorFilter) {
          try {
            allBrackets = await bracketApi.getBracketsByCreator(creatorFilter);
          } catch (error: any) {
            // Handle authentication errors gracefully
            if (error?.response?.status === 403 || error?.response?.status === 401) {
              console.error('Cannot fetch brackets by creator - authentication required or access denied');
              allBrackets = [];
            } else {
              // Log other errors but continue with empty array
              console.error('Error fetching brackets by creator:', error);
              allBrackets = [];
            }
          }
        } else if (sortBy === 'popular') {
          // OPTIMIZATION: Use dedicated popular brackets endpoint
          // This is cached on the backend and pre-sorted by result count
          allBrackets = await bracketApi.getPopularBrackets();
        } else {
          allBrackets = await bracketApi.getAllBrackets();
        }

        setBrackets(allBrackets);
        setFilteredBrackets(allBrackets);
      } catch (error) {
        console.error('Error fetching brackets:', error);
        setBrackets([]);
        setFilteredBrackets([]);
      } finally {
        setLoading(false);
      }
    };

    fetchBrackets();
  }, [creatorFilter, sortBy]);

  // Use debounced search query for filtering
  React.useEffect(() => {
    let filtered = brackets;

    // Filter by search query (debounced)
    if (debouncedSearchQuery.trim()) {
      filtered = filtered.filter(bracket =>
        bracket.name?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        bracket.description?.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
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

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(bracket => bracket.category === selectedCategory);
    }

    // Sort the filtered results (client-side for non-popular sorts)
    // Popular sort is already handled by the backend endpoint
    if (sortBy !== 'popular') {
      filtered = sortBrackets(filtered, sortBy);
    }

    setFilteredBrackets(filtered);
  }, [debouncedSearchQuery, selectedType, brackets, sortBy, creatorFilter, selectedCategory]);

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
      case 'popular':
        // Popular sorting is handled by backend endpoint
        // If we're here, just return as-is (already sorted from server)
        return sortedBrackets;
      default:
        return sortedBrackets;
    }
  };

  const getSortOptions = () => [
    { value: 'newest', label: 'Newest first' },
    { value: 'oldest', label: 'Oldest first' },
    { value: 'name-asc', label: 'Name A–Z' },
    { value: 'name-desc', label: 'Name Z–A' },
    { value: 'type', label: 'Type' },
    { value: 'popular', label: 'Most popular' }
  ];

  const getUniqueTypes = () => {
    const types = brackets.map(bracket => bracket.type).filter(Boolean);
    return Array.from(new Set(types));
  };

  const getUniqueCategories = () => {
    const categories = brackets.map(bracket => bracket.category).filter(Boolean);
    return Array.from(new Set(categories));
  };

  if (loading) {
    return <PageLoader label="Loading brackets" />;
  }

  const hasFilters = Boolean(searchQuery) || selectedType !== 'all' || selectedCategory !== 'all';

  return (
    <div className="page pb-24 pt-10 sm:pt-14">
      <header className="mb-8 max-w-2xl">
        <h1 className="font-display text-[3rem] font-black leading-none text-themed-primary sm:text-[3.5rem]">
          {creatorFilter ? 'My brackets' : 'Browse brackets'}
        </h1>
        <p className="mt-3 text-lg text-themed-secondary">
          {creatorFilter
            ? 'Every bracket you have made. Open one to play it or see its results.'
            : 'Find a bracket to play. Search by name, or narrow it down by type and category.'}
        </p>
      </header>

      {/* Search and filters */}
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_11rem_11rem_11rem]">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <label htmlFor="browse-search" className="sr-only">Search brackets</label>
          <svg className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-themed-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            id="browse-search"
            type="search"
            placeholder="Search by name or description"
            className="field pl-11"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <select
          aria-label="Filter by type"
          className="field"
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
        >
          <option value="all">All types</option>
          {getUniqueTypes().map(type => (
            <option key={type} value={type}>
              {typeLabel(type)}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by category"
          className="field"
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
        >
          <option value="all">All categories</option>
          {getUniqueCategories().map(category => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>

        <select
          aria-label="Sort by"
          className="field sm:col-span-2 lg:col-span-1"
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

      <p className="mb-6 text-sm text-themed-tertiary" aria-live="polite">
        Showing {filteredBrackets.length} of {brackets.length} brackets
        {searchQuery && <span> matching “{searchQuery}”</span>}
        {selectedType !== 'all' && <span> in {typeLabel(selectedType).toLowerCase()}</span>}
        {selectedCategory !== 'all' && <span> in {selectedCategory}</span>}
      </p>

      {filteredBrackets.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-16 text-center">
          <h2 className="font-display text-3xl font-extrabold">
            {hasFilters ? 'Nothing matches those filters' : creatorFilter ? 'You haven’t made a bracket yet' : 'No brackets yet'}
          </h2>
          <p className="mt-2 max-w-md text-themed-secondary">
            {hasFilters
              ? 'Try a different search, or clear the filters to see everything.'
              : 'Add a few videos, songs or images and let people pick a winner.'}
          </p>
          {hasFilters ? (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedType('all');
                setSelectedCategory('all');
              }}
              className="btn btn-secondary mt-6"
            >
              Clear filters
            </button>
          ) : (
            <Link to="/create" className="btn btn-primary mt-6">Create a bracket</Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredBrackets.map((bracket) => (
            <BracketCard key={bracket.id} bracket={bracket} />
          ))}
        </div>
      )}
    </div>
  );
};

export default BrowsePage;
