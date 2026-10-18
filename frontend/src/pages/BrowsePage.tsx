import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import BracketCard, { PageLoader, typeLabel } from '../components/BracketCard';
import { ErrorState } from '../components/PageStates';
import { bracketApi, errorMessage } from '../services/api';
import type { Bracket } from '@/types';
import { useDebounce } from '@/utils/debounce';
import { useAuth } from '../contexts/AuthContext';

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name-asc', label: 'Name A–Z' },
  { value: 'name-desc', label: 'Name Z–A' },
  { value: 'type', label: 'Type' },
  { value: 'popular', label: 'Most popular' },
] as const;
type Sort = typeof SORT_OPTIONS[number]['value'];

const time = (b: Bracket) => new Date(b.createdAt).getTime();

function sortBrackets(brackets: Bracket[], sort: Sort, popularRank: Map<number, number>): Bracket[] {
  const sorted = [...brackets];
  switch (sort) {
    case 'oldest': return sorted.sort((a, b) => time(a) - time(b));
    case 'name-asc': return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case 'name-desc': return sorted.sort((a, b) => b.name.localeCompare(a.name));
    case 'type': return sorted.sort((a, b) => a.type.localeCompare(b.type) || time(b) - time(a));
    case 'popular': {
      const rank = (b: Bracket) => popularRank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return sorted.sort((a, b) => rank(a) - rank(b) || time(b) - time(a));
    }
    default: return sorted.sort((a, b) => time(b) - time(a));
  }
}

type Data =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; brackets: Bracket[]; popularRank: Map<number, number> };

/**
 * All filters live in the URL (?q=&type=&category=&sort=&mine=1), so links, reloads and
 * back/forward reproduce the view and the navbar's plain /browse resets it.
 */
const BrowsePage: React.FC = () => {
  const { currentUser } = useAuth();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const type = params.get('type') ?? 'all';
  const category = params.get('category') ?? 'all';
  const sortParam = params.get('sort');
  const sort: Sort = SORT_OPTIONS.some(o => o.value === sortParam) ? (sortParam as Sort) : 'newest';
  const mine = params.get('mine') === '1';
  const debouncedQ = useDebounce(q, 300);

  const [data, setData] = React.useState<Data>({ status: 'loading' });
  const [reloadKey, setReloadKey] = React.useState(0);
  const needsPopular = sort === 'popular';
  const signedOutMine = mine && !currentUser;

  React.useEffect(() => {
    if (signedOutMine) return;
    let cancelled = false; // a slower, older request must not overwrite a newer one
    setData({ status: 'loading' });
    const list = mine ? bracketApi.getMyBrackets() : bracketApi.getAllBrackets();
    const popular = needsPopular ? bracketApi.getPopularBrackets() : Promise.resolve([] as Bracket[]);
    Promise.all([list, popular])
      .then(([brackets, popularList]) => {
        if (!cancelled) {
          setData({ status: 'ready', brackets, popularRank: new Map(popularList.map((b, i) => [b.id, i])) });
        }
      })
      .catch(error => { if (!cancelled) setData({ status: 'error', message: errorMessage(error) }); });
    return () => { cancelled = true; };
  }, [mine, needsPopular, signedOutMine, currentUser?.uid, reloadKey]);

  const setParam = (key: string, value: string, defaultValue: string) => {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      if (!value || value === defaultValue) next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });
  };

  const brackets = data.status === 'ready' ? data.brackets : [];
  const filtered = React.useMemo(() => {
    if (data.status !== 'ready') return [];
    const needle = debouncedQ.trim().toLowerCase();
    return sortBrackets(data.brackets.filter(b =>
      (!needle || b.name.toLowerCase().includes(needle) || (b.description ?? '').toLowerCase().includes(needle))
      && (type === 'all' || b.type === type)
      && (category === 'all' || b.category === category)), sort, data.popularRank);
  }, [data, debouncedQ, type, category, sort]);

  const types = Array.from(new Set(brackets.map(b => b.type)));
  const categories = Array.from(new Set(brackets.map(b => b.category).filter(Boolean)));
  const hasFilters = Boolean(q) || type !== 'all' || category !== 'all';

  return (
    <div className="page pb-24 pt-10 sm:pt-14">
      <header className="mb-8 max-w-2xl">
        <h1 className="font-display text-[3rem] font-black leading-none text-themed-primary sm:text-[3.5rem]">
          {mine ? 'My brackets' : 'Browse brackets'}
        </h1>
        <p className="mt-3 text-lg text-themed-secondary">
          {mine
            ? 'Every bracket you have made. Open one to play it or see its results.'
            : 'Find a bracket to play. Search by name, or narrow it down by type and category.'}
        </p>
      </header>

      {signedOutMine ? (
        <div className="card flex flex-col items-start px-6 py-10">
          <h2 className="font-display text-2xl font-extrabold">Sign in to see your brackets</h2>
          <p className="mt-1 text-themed-secondary">Your brackets are linked to your Google account.</p>
          <Link to="/browse" className="btn btn-secondary mt-6">Browse all brackets</Link>
        </div>
      ) : (
        <>
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
                value={q}
                onChange={(e) => setParam('q', e.target.value, '')}
              />
            </div>
            <select aria-label="Filter by type" className="field" value={type} onChange={(e) => setParam('type', e.target.value, 'all')}>
              <option value="all">All types</option>
              {types.map(t => <option key={t} value={t}>{typeLabel(t)}</option>)}
            </select>
            <select aria-label="Filter by category" className="field" value={category} onChange={(e) => setParam('category', e.target.value, 'all')}>
              <option value="all">All categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select aria-label="Sort by" className="field sm:col-span-2 lg:col-span-1" value={sort} onChange={(e) => setParam('sort', e.target.value, 'newest')}>
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {data.status === 'loading' && <PageLoader label="Loading brackets" />}

          {data.status === 'error' && (
            <ErrorState title="Brackets couldn’t be loaded" message={data.message} onRetry={() => setReloadKey(k => k + 1)} />
          )}

          {data.status === 'ready' && (
            <>
              <p className="mb-6 text-sm text-themed-tertiary" aria-live="polite">
                Showing {filtered.length} of {brackets.length} brackets
                {q && <span> matching “{q}”</span>}
                {type !== 'all' && <span> in {typeLabel(type).toLowerCase()}</span>}
                {category !== 'all' && <span> in {category}</span>}
              </p>

              {filtered.length === 0 ? (
                <div className="card flex flex-col items-center px-6 py-16 text-center">
                  <h2 className="font-display text-3xl font-extrabold">
                    {hasFilters ? 'Nothing matches those filters' : mine ? 'You haven’t made a bracket yet' : 'No brackets yet'}
                  </h2>
                  <p className="mt-2 max-w-md text-themed-secondary">
                    {hasFilters
                      ? 'Try a different search, or clear the filters to see everything.'
                      : 'Add a few videos, songs or images and let people pick a winner.'}
                  </p>
                  {hasFilters ? (
                    <button
                      onClick={() => setParams(prev => {
                        const next = new URLSearchParams(prev);
                        ['q', 'type', 'category'].forEach(k => next.delete(k));
                        return next;
                      }, { replace: true })}
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
                  {filtered.map(bracket => <BracketCard key={bracket.id} bracket={bracket} />)}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default BrowsePage;
