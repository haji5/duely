import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import BracketCard, { PageLoader, typeLabel } from '../components/BracketCard';
import { ErrorState } from '../components/PageStates';
import ConfirmDialog from '../components/ConfirmDialog';
import PageMeta, { pageTitle } from '../components/PageMeta';
import { bracketApi, errorMessage } from '../services/api';
import type { Bracket, BracketPage, BracketSort, BracketType } from '@/types';
import { CATEGORIES } from '@/utils/categories';
import { useDebounce } from '@/utils/debounce';
import { useAuth } from '../contexts/AuthContext';

const SORT_OPTIONS: { value: BracketSort; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'popular', label: 'Most popular' },
  { value: 'name', label: 'Name A–Z' },
];
const TYPES: BracketType[] = ['video', 'song', 'image'];
const PAGE_SIZE = 24;
/** The server refuses longer searches. */
const MAX_SEARCH_LENGTH = 100;

/** Sort values from older links, when the browser sorted the list itself, map to the nearest one. */
function parseSort(value: string | null): BracketSort {
  if (value === 'name-asc') return 'name';
  return SORT_OPTIONS.some(o => o.value === value) ? (value as BracketSort) : 'newest';
}

type Data =
  | { status: 'loading'; previous: BracketPage | null }
  | { status: 'error'; message: string }
  | { status: 'ready'; page: BracketPage };

/**
 * All filters live in the URL (?q=&type=&category=&sort=&page=&mine=1), so links, reloads and
 * back/forward reproduce the view and the navbar's plain /browse resets it. The server filters,
 * sorts and pages; ?page is 1-based.
 */
const BrowsePage: React.FC = () => {
  const { currentUser } = useAuth();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const typeParam = params.get('type');
  const type = TYPES.includes(typeParam as BracketType) ? (typeParam as BracketType) : 'all';
  const category = params.get('category') ?? 'all';
  const sort = parseSort(params.get('sort'));
  const pageNumber = Math.max(1, Math.floor(Number(params.get('page'))) || 1);
  const mine = params.get('mine') === '1';
  const debouncedQ = useDebounce(q.trim(), 300);

  const [data, setData] = React.useState<Data>({ status: 'loading', previous: null });
  const [reloadKey, setReloadKey] = React.useState(0);
  const signedOutMine = mine && !currentUser;

  React.useEffect(() => {
    if (signedOutMine) return;
    let cancelled = false; // a slower, older request must not overwrite a newer one
    // Keep showing the last page while the next one loads, so the grid doesn't flash empty.
    setData(d => ({ status: 'loading', previous: d.status === 'ready' ? d.page : d.status === 'loading' ? d.previous : null }));
    const query = {
      sort,
      type: type === 'all' ? undefined : type,
      category: category === 'all' ? undefined : category,
      q: debouncedQ || undefined,
      page: pageNumber - 1,
      size: PAGE_SIZE,
    };
    (mine ? bracketApi.getMyBrackets(query) : bracketApi.listBrackets(query))
      .then(page => { if (!cancelled) setData({ status: 'ready', page }); })
      .catch(error => { if (!cancelled) setData({ status: 'error', message: errorMessage(error) }); });
    return () => { cancelled = true; };
  }, [mine, signedOutMine, sort, type, category, debouncedQ, pageNumber, currentUser?.uid, reloadKey]);

  /** Changing a filter starts again from the first page. */
  const setParam = (key: string, value: string, defaultValue: string) => {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      if (!value || value === defaultValue) next.delete(key);
      else next.set(key, value);
      next.delete('page');
      return next;
    }, { replace: true });
  };

  const goToPage = (n: number) => {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      if (n <= 1) next.delete('page');
      else next.set('page', String(n));
      return next;
    });
    window.scrollTo(0, 0);
  };

  const shown = data.status === 'ready' ? data.page : data.status === 'loading' ? data.previous : null;
  const hasFilters = Boolean(q) || type !== 'all' || category !== 'all';
  // A category from an older link that is not on the fixed list still shows as selected.
  const categories: string[] = category !== 'all' && !(CATEGORIES as readonly string[]).includes(category)
    ? [...CATEGORIES, category]
    : [...CATEGORIES];

  return (
    <div className="page pb-24 pt-10 sm:pt-14">
      <PageMeta
        title={mine ? 'My brackets | Duely' : category !== 'all' ? pageTitle(`${category} brackets`) : 'Browse brackets | Duely'}
        description={category !== 'all' && !mine
          ? `Play ${category} brackets on Duely: pick a favourite of two each match until one is left standing.`
          : 'Find a song, video or image bracket to play on Duely. Search by name, or filter by type and category.'}
      />
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
                maxLength={MAX_SEARCH_LENGTH}
                value={q}
                onChange={(e) => setParam('q', e.target.value, '')}
              />
            </div>
            <select aria-label="Filter by type" className="field" value={type} onChange={(e) => setParam('type', e.target.value, 'all')}>
              <option value="all">All types</option>
              {TYPES.map(t => <option key={t} value={t}>{typeLabel(t)}</option>)}
            </select>
            <select aria-label="Filter by category" className="field" value={category} onChange={(e) => setParam('category', e.target.value, 'all')}>
              <option value="all">All categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select aria-label="Sort by" className="field sm:col-span-2 lg:col-span-1" value={sort} onChange={(e) => setParam('sort', e.target.value, 'newest')}>
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {data.status === 'error' && (
            <ErrorState title="Brackets couldn’t be loaded" message={data.message} onRetry={() => setReloadKey(k => k + 1)} />
          )}

          {data.status !== 'error' && !shown && <PageLoader label="Loading brackets" />}

          {data.status !== 'error' && shown && (
            <Results
              page={shown}
              loading={data.status === 'loading'}
              mine={mine}
              summary={{ q: debouncedQ, type, category }}
              hasFilters={hasFilters}
              onClearFilters={() => setParams(prev => {
                const next = new URLSearchParams(prev);
                ['q', 'type', 'category', 'page'].forEach(k => next.delete(k));
                return next;
              }, { replace: true })}
              onPage={goToPage}
              onDeleted={(id) => setData(d => (d.status === 'ready'
                ? { ...d, page: { ...d.page, items: d.page.items.filter(b => b.id !== id), total: d.page.total - 1 } }
                : d))}
            />
          )}
        </>
      )}
    </div>
  );
};

/** One page of brackets with its count line, empty states and page controls. */
const Results: React.FC<{
  page: BracketPage;
  loading: boolean;
  mine: boolean;
  summary: { q: string; type: string; category: string };
  hasFilters: boolean;
  onClearFilters: () => void;
  onPage: (n: number) => void;
  onDeleted: (id: number) => void;
}> = ({ page, loading, mine, summary, hasFilters, onClearFilters, onPage, onDeleted }) => {
  const pages = Math.max(1, Math.ceil(page.total / page.size));
  const current = page.page + 1;
  const first = page.page * page.size + 1;
  const last = page.page * page.size + page.items.length;
  const pastTheEnd = page.items.length === 0 && page.total > 0;
  const n = (value: number) => value.toLocaleString();

  return (
    <div aria-busy={loading}>
      <p className="mb-6 text-sm text-themed-tertiary" aria-live="polite">
        {loading ? 'Loading…' : (
          <>
            {pastTheEnd || page.total === 0
              ? `${n(page.total)} ${page.total === 1 ? 'bracket' : 'brackets'}`
              : `Showing ${n(first)}–${n(last)} of ${n(page.total)} ${page.total === 1 ? 'bracket' : 'brackets'}`}
            {summary.q && <span> matching “{summary.q}”</span>}
            {summary.type !== 'all' && <span> in {typeLabel(summary.type).toLowerCase()}</span>}
            {summary.category !== 'all' && <span> in {summary.category}</span>}
          </>
        )}
      </p>

      {pastTheEnd ? (
        <div className="card flex flex-col items-center px-6 py-16 text-center">
          <h2 className="font-display text-3xl font-extrabold">This page is past the end</h2>
          <p className="mt-2 max-w-md text-themed-secondary">There are fewer brackets than that now.</p>
          <button type="button" onClick={() => onPage(1)} className="btn btn-secondary mt-6">Go to the first page</button>
        </div>
      ) : page.items.length === 0 ? (
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
            <button type="button" onClick={onClearFilters} className="btn btn-secondary mt-6">Clear filters</button>
          ) : (
            <Link to="/create" className="btn btn-primary mt-6">Create a bracket</Link>
          )}
        </div>
      ) : (
        <div className={`grid grid-cols-1 gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3 ${loading ? 'opacity-60' : ''}`}>
          {page.items.map(bracket => (mine
            ? <OwnBracket key={bracket.id} bracket={bracket} onDeleted={() => onDeleted(bracket.id)} />
            : <BracketCard key={bracket.id} bracket={bracket} />))}
        </div>
      )}

      {pages > 1 && !pastTheEnd && (
        <nav className="mt-10 flex items-center justify-center gap-3" aria-label="Pages">
          <button type="button" className="btn btn-secondary" disabled={loading || current <= 1} onClick={() => onPage(current - 1)}>
            Previous
          </button>
          <span className="tabular text-sm text-themed-secondary">Page {current} of {pages}</span>
          <button type="button" className="btn btn-secondary" disabled={loading || current >= pages} onClick={() => onPage(current + 1)}>
            Next
          </button>
        </nav>
      )}
    </div>
  );
};

/** One of the signed-in user's brackets, which they may delete. */
const OwnBracket: React.FC<{ bracket: Bracket; onDeleted: () => void }> = ({ bracket, onDeleted }) => {
  const [confirming, setConfirming] = React.useState(false);
  return (
    <div className="flex flex-col">
      <div className="flex-1"><BracketCard bracket={bracket} /></div>
      <div className="mt-1 flex justify-end">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="btn btn-ghost px-3 py-1.5 text-sm"
          aria-label={`Delete ${bracket.name}`}
        >
          Delete
        </button>
      </div>
      {confirming && (
        <ConfirmDialog
          title="Delete this bracket?"
          confirmLabel="Delete bracket"
          busyLabel="Deleting…"
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            await bracketApi.deleteBracket(bracket.id);
            onDeleted();
          }}
        >
          <p>
            “{bracket.name}” goes for good, with every run anyone has played and its rankings. This can’t be undone.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
};

export default BrowsePage;
