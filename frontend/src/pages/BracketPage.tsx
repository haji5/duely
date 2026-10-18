import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { bracketApi, errorMessage, errorStatus } from '../services/api';
import type { Bracket, Item } from '@/types';
import MediaPreview from '../components/MediaPreview';
import { PageLoader, TypeIcon } from '../components/BracketCard';
import { useAuth } from '../contexts/AuthContext';
import { useSessionBattles } from '../contexts/SessionBattleContext';
import {
  bracketSizeOptions, createTournament, currentMatch, finalRanking, pick, playedMatches, progress,
  realMatchCount, roundName, TournamentState,
} from '@/utils/tournament';
import { randomId } from '@/utils/ids';
import { playSelectionTick, playSuccessChime, playTick } from '@/utils/sound';

type Load =
  | { status: 'loading' }
  | { status: 'error'; title: string; message: string }
  | { status: 'ready'; bracket: Bracket; items: Item[] };

interface Animation {
  winnerId: number;
  loserId: number;
}

const PICK_ANIMATION_MS = 2000;

const BracketPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const bracketId = Number(id);
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { addSessionBattle } = useSessionBattles();

  const [load, setLoad] = React.useState<Load>({ status: 'loading' });
  const [reloadKey, setReloadKey] = React.useState(0);
  const [selectedSize, setSelectedSize] = React.useState<number | null>(null);
  const [tournament, setTournament] = React.useState<TournamentState | null>(null);
  const [animation, setAnimation] = React.useState<Animation | null>(null);
  const pickTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined);

  // Completion: the token is created once per finished run so retries stay idempotent.
  const [form, setForm] = React.useState({ displayName: '', comment: '' });
  const [submissionToken, setSubmissionToken] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  React.useEffect(() => () => clearTimeout(pickTimer.current), []);

  React.useEffect(() => {
    let cancelled = false;
    setLoad({ status: 'loading' });
    setTournament(null);
    setSelectedSize(null);
    if (!Number.isInteger(bracketId) || bracketId <= 0) {
      setLoad({ status: 'error', title: 'Bracket not found', message: 'The link looks wrong.' });
      return;
    }
    Promise.all([bracketApi.getBracket(bracketId), bracketApi.getBracketItems(bracketId)])
      .then(([bracket, items]) => {
        if (cancelled) return;
        if (items.length < 2) {
          setLoad({ status: 'error', title: 'This bracket can’t start', message: 'It needs at least 2 entries.' });
        } else {
          setLoad({ status: 'ready', bracket, items });
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setLoad(errorStatus(error) === 404
          ? { status: 'error', title: 'Bracket not found', message: 'It may have been removed, or the link is wrong.' }
          : { status: 'error', title: 'Couldn’t load this bracket', message: errorMessage(error) });
      });
    return () => { cancelled = true; };
  }, [bracketId, reloadKey]);

  const complete = tournament?.complete ?? false;
  React.useEffect(() => {
    if (complete) {
      setForm({ displayName: currentUser?.displayName ?? '', comment: '' });
      setSubmissionToken(randomId());
      setSaveError(null);
    }
  }, [complete, currentUser]);

  if (load.status === 'loading') {
    return <PageLoader label="Loading bracket" />;
  }

  if (load.status === 'error') {
    return (
      <div className="page flex min-h-[60vh] flex-col items-start justify-center py-16">
        <h1 className="font-display text-[2.75rem] font-black leading-none">{load.title}</h1>
        <p className="mt-3 max-w-lg text-lg text-themed-secondary">{load.message}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button onClick={() => setReloadKey(k => k + 1)} className="btn btn-primary">Try again</button>
          <button onClick={() => navigate('/browse')} className="btn btn-secondary">Browse brackets</button>
        </div>
      </div>
    );
  }

  const { bracket, items } = load;

  if (!tournament) {
    const options = bracketSizeOptions(items.length);
    return (
      <div className="page max-w-3xl pb-24 pt-10 sm:pt-16">
        <p className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-themed-secondary">
          <TypeIcon type={bracket.type} />
          {items.length} entries in this bracket
        </p>
        <h1 className="font-display text-[3rem] font-black leading-[0.95] text-themed-primary sm:text-[4rem]">
          {bracket.name}
        </h1>
        {bracket.description && (
          <p className="mt-4 max-w-2xl whitespace-pre-line text-lg text-themed-secondary">{bracket.description}</p>
        )}

        <fieldset className="mt-10">
          <legend className="font-display text-2xl font-extrabold text-themed-primary">How many go in?</legend>
          <p className="mt-1 text-themed-secondary">
            Bigger brackets take longer and give every entry a fair shot.
            {options[0] > items.length && ' Spare spots become byes, so a few entries skip the first round.'}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Bracket size">
            {options.map(size => {
              const matches = realMatchCount(items.length, size);
              const byes = Math.max(0, size - items.length);
              return (
                <label key={size} className="choice cursor-pointer px-4 py-3">
                  <input
                    type="radio"
                    name="bracket-size"
                    value={size}
                    checked={selectedSize === size}
                    onChange={() => { setSelectedSize(size); playTick(800, 0.1, 0.06); }}
                    className="sr-only"
                  />
                  <span className="block font-display text-[1.6rem] font-extrabold leading-none text-themed-primary">
                    {roundName(size)}
                  </span>
                  <span className="mt-1.5 block text-sm font-medium text-themed-tertiary">
                    {matches} {matches === 1 ? 'match' : 'matches'}
                    {byes > 0 && `, ${byes} ${byes === 1 ? 'bye' : 'byes'}`}
                    {size < items.length && `, ${size} random entries`}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-8 flex flex-col gap-3 border-t border-themed-primary pt-8 sm:flex-row">
          <button
            disabled={!selectedSize}
            onClick={() => {
              if (!selectedSize) return;
              playTick(1000, 0.1, 0.08);
              setTournament(createTournament(items, selectedSize));
            }}
            className="btn btn-primary btn-lg sm:min-w-[16rem]"
          >
            {selectedSize ? `Start the ${roundName(selectedSize).toLowerCase()}` : 'Pick a size to start'}
          </button>
          <button onClick={() => navigate(`/results/${bracketId}`)} className="btn btn-secondary btn-lg">
            See results so far
          </button>
        </div>
      </div>
    );
  }

  if (tournament.complete) {
    const ranking = finalRanking(tournament);
    const champion = ranking[0];

    const save = async (withDetails: boolean) => {
      if (!submissionToken || saving) return;
      setSaving(true);
      setSaveError(null);
      const run = {
        ranking: ranking.map(item => item.id),
        matches: playedMatches(tournament),
        displayName: withDetails ? form.displayName.trim() || undefined : undefined,
        comment: withDetails ? form.comment.trim() || undefined : undefined,
      };
      try {
        await bracketApi.saveBracketResult(bracketId, { ...run, submissionToken });
        if (!currentUser) {
          addSessionBattle({ bracketId, bracketName: bracket.name, ...run });
        }
        navigate(`/results/${bracketId}?fromBattle=true`);
      } catch (error) {
        setSaveError(errorMessage(error, 'Your result couldn’t be saved.'));
        setSaving(false);
      }
    };

    const continueWithoutSaving = () => {
      if (!currentUser) {
        addSessionBattle({ bracketId, bracketName: bracket.name, ranking: ranking.map(i => i.id), matches: playedMatches(tournament) });
        navigate(`/results/${bracketId}?fromBattle=true`);
      } else {
        navigate(`/results/${bracketId}`);
      }
    };

    return (
      <div className="page max-w-2xl pb-24 pt-10 sm:pt-16">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div
            className="relative overflow-hidden rounded-lg px-6 py-8 sm:px-8"
            style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--accent-primary-text)' }}
          >
            <svg className="absolute -bottom-6 -right-6 h-36 w-36 opacity-10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M6 1h12v4h4v2a5 5 0 01-5 5h-.4A6 6 0 0113 15.9V19h4v3H7v-3h4v-3.1A6 6 0 017.4 12H7a5 5 0 01-5-5V5h4V1zm0 6H4a3 3 0 002.3 2.9A6 6 0 016 8V7zm12 0v1a6 6 0 01-.3 1.9A3 3 0 0020 7h-2z" />
            </svg>
            <p className="relative font-semibold" style={{ color: 'inherit' }}>Your champion of {bracket.name}</p>
            <h1 className="relative mt-2 pr-10 font-display text-[2.5rem] font-black leading-[0.95] sm:text-[3.25rem]" style={{ color: 'inherit' }}>
              {champion ? champion.title : 'Bracket complete'}
            </h1>
          </div>

          <form
            className="mt-8 space-y-5"
            onSubmit={(e) => { e.preventDefault(); void save(true); }}
          >
            <p className="text-themed-secondary">
              Add your name and a few words to the results page, or skip straight to the rankings.
            </p>
            <div>
              <label htmlFor="displayName" className="field-label">Your name</label>
              <input
                id="displayName"
                type="text"
                maxLength={100}
                value={form.displayName}
                onChange={(e) => setForm(f => ({ ...f, displayName: e.target.value }))}
                placeholder="Shown next to your comment"
                className="field"
                disabled={saving}
              />
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <label htmlFor="comment" className="field-label">
                  Comment <span className="font-normal text-themed-tertiary">(optional)</span>
                </label>
                <span className="field-hint tabular">{form.comment.length}/500</span>
              </div>
              <textarea
                id="comment"
                maxLength={500}
                rows={3}
                value={form.comment}
                onChange={(e) => setForm(f => ({ ...f, comment: e.target.value }))}
                placeholder="Why did this one win?"
                className="field resize-none"
                disabled={saving}
              />
            </div>

            {saveError && (
              <div className="notice notice-error" role="alert">
                <p className="font-semibold text-themed-primary">Your result wasn’t saved</p>
                <p className="mt-0.5">{saveError}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="submit" className="btn btn-primary">Try again</button>
                  <button type="button" onClick={continueWithoutSaving} className="btn btn-secondary">
                    Continue without saving
                  </button>
                </div>
                {!currentUser && (
                  <p className="mt-2 text-xs">Without saving, the run stays only in this tab.</p>
                )}
              </div>
            )}

            {!saveError && (
              <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                <button type="submit" className="btn btn-primary btn-lg flex-1" disabled={saving}>
                  {saving ? <><span className="spinner" /> Saving…</> : 'Post and see results'}
                </button>
                <button type="button" onClick={() => void save(false)} className="btn btn-secondary btn-lg" disabled={saving}>
                  Skip
                </button>
              </div>
            )}
          </form>
        </motion.div>
      </div>
    );
  }

  const match = currentMatch(tournament);
  const status = progress(tournament);

  const handleChoice = (chosen: Item) => {
    if (animation || !match?.a || !match.b) return;
    const loser = chosen.id === match.a.id ? match.b : match.a;
    playSelectionTick();
    setAnimation({ winnerId: chosen.id, loserId: loser.id });
    setTimeout(playSuccessChime, 300);
    clearTimeout(pickTimer.current);
    pickTimer.current = setTimeout(() => {
      setTournament(t => (t ? pick(t, chosen) : t));
      setAnimation(null);
    }, PICK_ANIMATION_MS);
  };

  return (
    <div className="page max-w-6xl pb-16 pt-6 sm:pt-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-themed-secondary">{bracket.name}</p>
          <h1 className="font-display text-[2.6rem] font-black leading-none text-themed-primary sm:text-[3.25rem]">
            {roundName(status.roundSize)}
          </h1>
        </div>
        <p className="font-display text-2xl font-bold text-themed-secondary tabular">
          Match {status.matchNumber} of {status.matchesInRound}
        </p>
      </div>

      <div
        className="mb-8 h-1.5 w-full overflow-hidden rounded-full bg-themed-tertiary"
        role="progressbar"
        aria-label="Bracket progress"
        aria-valuemin={0}
        aria-valuemax={status.total}
        aria-valuenow={status.played}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${(status.played / Math.max(1, status.total)) * 100}%`, backgroundColor: 'var(--accent-primary)' }}
        />
      </div>

      {match?.a && match.b && (
        // Keyed per match so every preview starts fresh and the entrance animation replays.
        <BattleArena
          key={`${tournament.roundIndex}-${tournament.matchIndex}`}
          a={match.a}
          b={match.b}
          onChoice={handleChoice}
          animation={animation}
        />
      )}

      {bracket.type !== 'image' && (
        <p className="mt-6 text-center text-sm text-themed-tertiary">
          {bracket.type === 'video'
            ? 'Press play on a card to preview the clip, then pick your winner.'
            : 'Play a preview on each card, then pick your winner.'}
        </p>
      )}
    </div>
  );
};

const BattleArena: React.FC<{
  a: Item;
  b: Item;
  onChoice: (item: Item) => void;
  animation: Animation | null;
}> = ({ a, b, onChoice, animation }) => (
  <div className="relative grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-6">
    <BattleItem key={a.id} item={a} onSelect={() => onChoice(a)} side="left" animation={animation} />
    <div className="flex items-center justify-center md:hidden" aria-hidden="true">
      <span className="font-display text-[1.9rem] font-black italic leading-none text-themed-primary">VS</span>
    </div>
    <BattleItem key={b.id} item={b} onSelect={() => onChoice(b)} side="right" animation={animation} />
    <div
      className="pointer-events-none absolute left-1/2 top-1/2 z-10 hidden h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full md:flex"
      style={{ backgroundColor: 'var(--bg-primary)', boxShadow: '0 0 0 6px var(--bg-primary)' }}
      aria-hidden="true"
    >
      <span className="font-display text-[2.2rem] font-black italic leading-none text-themed-primary">VS</span>
    </div>
  </div>
);

const BattleItem: React.FC<{
  item: Item;
  onSelect: () => void;
  side: 'left' | 'right';
  animation: Animation | null;
}> = ({ item, onSelect, side, animation }) => {
  const isWinner = animation?.winnerId === item.id;
  const isLoser = animation?.loserId === item.id;
  const canPick = animation === null;
  const sideColor = side === 'left' ? 'var(--side-a)' : 'var(--side-b)';

  return (
    <motion.div
      initial={{ x: side === 'left' ? -40 : 40, opacity: 0 }}
      animate={{ x: 0, opacity: isLoser ? 0.55 : 1, scale: isWinner ? 1.02 : isLoser ? 0.97 : 1 }}
      transition={{ duration: 0.4, scale: { duration: 0.3 }, opacity: { duration: 0.3 } }}
      className="relative"
    >
      {/* Clicking the card picks it (mouse convenience); the Pick button is the accessible control. */}
      <div
        onClick={() => canPick && onSelect()}
        className={`group card relative flex min-h-[24rem] flex-col overflow-hidden border-2 transition-colors duration-200 sm:min-h-[30rem] ${canPick ? 'cursor-pointer' : 'cursor-default'}`}
        style={{
          borderColor: isWinner ? 'var(--accent-primary)' : undefined,
          borderTopColor: isWinner ? 'var(--accent-primary)' : sideColor,
          borderTopWidth: 6,
        }}
      >
        <div className="flex min-h-0 flex-1 items-center justify-center p-5 sm:p-6">
          <div className="w-full max-w-md">
            <MediaPreview item={item} />
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-4 border-t border-themed-primary px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[1.75rem] font-extrabold leading-[1.05] text-themed-primary line-clamp-2">
              {item.title}
            </h2>
            {(isWinner || isLoser) && (
              <p className="mt-1 text-sm font-semibold" style={{ color: isWinner ? 'var(--accent-ink)' : 'var(--text-tertiary)' }}>
                {isWinner ? 'Through to the next round' : 'Knocked out'}
              </p>
            )}
          </div>
          {canPick && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSelect(); }}
              className="pick-chip shrink-0 rounded-md border px-4 py-2 font-semibold"
              style={{ '--side': sideColor } as React.CSSProperties}
              aria-label={`Pick ${item.title}`}
            >
              Pick
            </button>
          )}
        </div>

        {canPick && (
          <div
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-[0.07]"
            style={{ backgroundColor: sideColor }}
          />
        )}

        {isWinner && (
          <>
            <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
              {[...Array(12)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: i % 3 === 0 ? sideColor : 'var(--accent-primary)' }}
                  initial={{ x: '50%', y: '50%', scale: 0, opacity: 1 }}
                  animate={{
                    x: `${50 + (Math.random() - 0.5) * 200}%`,
                    y: `${50 + (Math.random() - 0.5) * 200}%`,
                    scale: [0, 1, 0],
                    opacity: [1, 1, 0],
                    rotate: Math.random() * 360,
                  }}
                  transition={{ duration: 1.5, delay: i * 0.08, ease: 'easeOut' }}
                />
              ))}
            </div>
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.4, type: 'spring' }}
              className="absolute left-4 top-4 z-10 rounded-md px-3 py-1.5 font-display text-lg font-extrabold"
              style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--accent-primary-text)' }}
            >
              Winner
            </motion.div>
          </>
        )}

        {isLoser && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.3 }}
            className="absolute right-4 top-4 z-10 rounded-md bg-themed-tertiary px-3 py-1.5 font-display text-lg font-extrabold text-themed-secondary"
          >
            Out
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

export default BracketPage;
