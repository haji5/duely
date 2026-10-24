import React from 'react';
import BracketCard, { PageLoader } from '../components/BracketCard';
import BracketDiagram from '../components/BracketDiagram';
import { bracketApi, errorMessage } from '../services/api';
import { ErrorState } from '../components/PageStates';
import { Bracket } from '@/types';
import { Link, useNavigate } from "react-router-dom";

type Sections = { category: string; brackets: Bracket[] }[];

/** Groups brackets by category; within a category and across categories, more played first. */
function categorize(brackets: Bracket[], popular: Bracket[]): Sections {
  // /brackets/popular lists every playable bracket, most runs first, so its order is the rank.
  const rank = new Map(popular.map((b, i) => [b.id, i]));
  const rankOf = (b: Bracket) => rank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
  const byCategory = new Map<string, Bracket[]>();
  brackets.forEach(b => {
    const category = b.category || 'General';
    byCategory.set(category, [...(byCategory.get(category) ?? []), b]);
  });
  return Array.from(byCategory, ([category, list]) => ({
    category,
    brackets: [...list].sort((a, b) => rankOf(a) - rankOf(b)
      || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  }))
    // Categories whose best bracket is most played come first, then bigger categories
    .sort((a, b) => rankOf(a.brackets[0]) - rankOf(b.brackets[0]) || b.brackets.length - a.brackets.length);
}

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [brackets, setBrackets] = React.useState<Bracket[]>([]);
  const [popularBrackets, setPopularBrackets] = React.useState<Bracket[]>([]);
  const [status, setStatus] = React.useState<'loading' | 'error' | 'ready'>('loading');
  const [error, setError] = React.useState('');
  const [reloadKey, setReloadKey] = React.useState(0);
  const [searchQuery, setSearchQuery] = React.useState('');

  const handleSearchClick = () => {
    if (searchQuery.trim()) {
      navigate(`/browse?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  React.useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    // allSettled: a failed popular list shouldn't hide every bracket
    Promise.allSettled([bracketApi.getAllBrackets(), bracketApi.getPopularBrackets()]).then(([all, popular]) => {
      if (cancelled) return;
      if (all.status === 'rejected') {
        setError(errorMessage(all.reason));
        setStatus('error');
        return;
      }
      setBrackets(all.value);
      setPopularBrackets(popular.status === 'fulfilled' ? popular.value : []);
      setStatus('ready');
    });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const categorizedBrackets = React.useMemo(() => categorize(brackets, popularBrackets), [brackets, popularBrackets]);

  if (status === 'loading') {
    return <PageLoader label="Loading brackets" />;
  }

  const recentBrackets = [...brackets]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);

  return (
    <div className="pb-24">
      {/* Hero */}
      <section className="border-b border-themed-primary">
        <div className="page grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
          <div>
            <h1 className="font-display text-[3.4rem] font-black uppercase leading-[0.9] tracking-tight text-themed-primary sm:text-[4.75rem] lg:text-[5.5rem]">
              Settle it
              <br />
              head to head.
            </h1>
            <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-themed-secondary">
              Line up songs, videos or images in a bracket. Each match you pick one of two,
              round after round, until a single favourite is left standing.
            </p>

            <form
              className="mt-8 flex max-w-[34rem] gap-2"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                handleSearchClick();
              }}
            >
              <label htmlFor="home-search" className="sr-only">Search brackets</label>
              <div className="relative flex-1">
                <svg className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-themed-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  id="home-search"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search brackets"
                  className="field py-3 pl-11"
                />
              </div>
              <button type="submit" className="btn btn-primary btn-lg">
                Search
              </button>
            </form>

            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.95rem]">
              <Link to="/browse" className="font-semibold text-themed-primary underline decoration-[color:var(--border-secondary)] decoration-2 underline-offset-4 hover:decoration-[color:var(--accent-primary)]">
                Browse all brackets
              </Link>
              <button
                type="button"
                onClick={() => navigate('/create')}
                className="font-semibold text-themed-primary underline decoration-[color:var(--border-secondary)] decoration-2 underline-offset-4 hover:decoration-[color:var(--accent-primary)]"
              >
                Make your own
              </button>
            </div>
          </div>

          <div className="mx-auto w-full max-w-[560px]">
            <BracketDiagram className="h-auto w-full" />
          </div>
        </div>
      </section>

      {status === 'error' && (
        <section className="page pt-16">
          <ErrorState title="Brackets couldn’t be loaded" message={error} onRetry={() => setReloadKey(k => k + 1)} />
        </section>
      )}

      {status === 'ready' && brackets.length === 0 && (
        <section className="page pt-16 text-center">
          <h2 className="font-display text-3xl font-extrabold">No brackets yet</h2>
          <p className="mx-auto mt-2 max-w-md text-themed-secondary">
            Start the first one: add a few videos, songs or images and let people pick a winner.
          </p>
          <Link to="/create" className="btn btn-primary btn-lg mt-6">Create a bracket</Link>
        </section>
      )}

      {popularBrackets.length > 0 && (
        <BracketSection
          title="Popular right now"
          subtitle="The brackets people are playing most"
          brackets={popularBrackets.slice(0, 6)}
          moreHref="/browse?sort=popular"
          moreLabel="See all popular"
        />
      )}

      {categorizedBrackets.map((categorySection) => (
        <BracketSection
          key={categorySection.category}
          title={categorySection.category}
          brackets={categorySection.brackets.slice(0, 3)}
          moreHref={`/browse?category=${encodeURIComponent(categorySection.category)}&sort=popular`}
          moreLabel={`See all ${categorySection.category}`}
        />
      ))}

      {recentBrackets.length > 0 && (
        <BracketSection
          title="Recently added"
          brackets={recentBrackets}
          moreHref="/browse"
          moreLabel="Browse all"
        />
      )}
    </div>
  );
};

const BracketSection: React.FC<{
  title: string;
  subtitle?: string;
  brackets: Bracket[];
  moreHref: string;
  moreLabel: string;
}> = ({ title, subtitle, brackets, moreHref, moreLabel }) => (
  <section className="page pt-14 sm:pt-16">
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h2 className="font-display text-[2.1rem] font-extrabold leading-none text-themed-primary">{title}</h2>
        {subtitle && <p className="mt-2 text-themed-secondary">{subtitle}</p>}
      </div>
      <Link
        to={moreHref}
        className="shrink-0 rounded-md px-1 text-[0.95rem] font-semibold text-accent hover:underline underline-offset-4"
      >
        {moreLabel}
      </Link>
    </div>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {brackets.map((bracket) => (
        <BracketCard key={bracket.id} bracket={bracket} />
      ))}
    </div>
  </section>
);

export default HomePage;
