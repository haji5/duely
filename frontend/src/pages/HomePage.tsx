import React from 'react';
import BracketCard, { PageLoader } from '../components/BracketCard';
import BracketDiagram from '../components/BracketDiagram';
import { bracketApi, errorMessage } from '../services/api';
import { ErrorState } from '../components/PageStates';
import PageMeta from '../components/PageMeta';
import { Bracket, HomeLists } from '@/types';
import { Link, useNavigate } from "react-router-dom";

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [lists, setLists] = React.useState<HomeLists>({ popular: [], recent: [], categories: [] });
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
    // One request: the server picks and orders all three lists.
    bracketApi.getHome().then(
      home => {
        if (cancelled) return;
        setLists(home);
        setStatus('ready');
      },
      reason => {
        if (cancelled) return;
        setError(errorMessage(reason));
        setStatus('error');
      },
    );
    return () => { cancelled = true; };
  }, [reloadKey]);

  const meta = (
    <PageMeta
      title="Duely — Song, video & image brackets, voted head to head"
      description="Make a bracket of songs, videos or images and pick a favourite of two each match, round after round, until one is left. Play brackets others made."
    />
  );

  if (status === 'loading') {
    return <>{meta}<PageLoader label="Loading brackets" /></>;
  }

  const { popular: popularBrackets, recent: recentBrackets, categories: categorizedBrackets } = lists;

  return (
    <div className="pb-24">
      {meta}
      {/* Hero */}
      <section className="border-b border-themed-primary">
        <div className="page grid items-center gap-10 py-10 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
          <div>
            <p className="mb-4 text-[0.95rem] font-bold uppercase tracking-[0.14em] text-accent">
              Song, video &amp; image bracket maker
            </p>
            <h1 className="font-display text-[3.4rem] font-black uppercase leading-[0.9] tracking-tight text-themed-primary sm:text-[4.75rem] lg:text-[5.5rem]">
              Settle it{' '}
              <br />
              head to head.
            </h1>
            <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-themed-secondary">
              Line up songs, videos or images in a bracket, or turn a public Spotify playlist into one.
              Each match you pick one of two, round after round, until a single favourite is left standing.
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
              <Link to="/browse" className="inline-flex min-h-6 items-center py-1 font-semibold text-themed-primary underline decoration-[color:var(--border-secondary)] decoration-2 underline-offset-4 hover:decoration-[color:var(--accent-primary)]">
                Browse all brackets
              </Link>
              <Link
                to="/create"
                className="inline-flex min-h-6 items-center py-1 font-semibold text-themed-primary underline decoration-[color:var(--border-secondary)] decoration-2 underline-offset-4 hover:decoration-[color:var(--accent-primary)]"
              >
                Make your own
              </Link>
            </div>
          </div>

          {/* Decorative: below lg it would stack under the hero and push every bracket out of the first screen */}
          <div className="mx-auto hidden w-full max-w-[560px] lg:block">
            <BracketDiagram className="h-auto w-full" />
          </div>
        </div>
      </section>

      <HowItWorks />

      {status === 'error' && (
        <section className="page pt-16">
          <ErrorState title="Brackets couldn’t be loaded" message={error} onRetry={() => setReloadKey(k => k + 1)} />
        </section>
      )}

      {status === 'ready' && recentBrackets.length === 0 && (
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

const STEPS = [
  {
    title: 'Pick or make a bracket',
    text: 'Play one of the brackets below, or make your own from YouTube links, Spotify tracks or images. A Spotify playlist fills it in for you.',
  },
  {
    title: 'Choose one of two',
    text: 'Each match shows two entries. Your pick moves on to the next round until one champion is left.',
  },
  {
    title: 'Compare with everyone',
    text: 'Every finished run counts towards the community ranking, so you can see how your champion stacks up.',
  },
];

const HowItWorks: React.FC = () => (
  <section className="page pt-14 sm:pt-16" aria-labelledby="how-it-works">
    <div className="mb-6 flex items-end justify-between gap-4">
      <h2 id="how-it-works" className="font-display text-[2.1rem] font-extrabold leading-none text-themed-primary">How it works</h2>
      <Link to="/about" className="inline-flex min-h-6 shrink-0 items-center rounded-md px-1 py-1 text-[0.95rem] font-semibold text-accent hover:underline underline-offset-4">
        How rankings work
      </Link>
    </div>
    <ol className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {STEPS.map((step, i) => (
        <li key={step.title} className="card flex gap-4 p-5">
          <span className="font-display text-[2.25rem] font-black leading-none text-accent tabular" aria-hidden="true">{i + 1}</span>
          <div>
            <h3 className="font-semibold text-themed-primary">{step.title}</h3>
            <p className="mt-1 text-themed-secondary">{step.text}</p>
          </div>
        </li>
      ))}
    </ol>
  </section>
);

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
        className="inline-flex min-h-6 shrink-0 items-center rounded-md px-1 py-1 text-[0.95rem] font-semibold text-accent hover:underline underline-offset-4"
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
