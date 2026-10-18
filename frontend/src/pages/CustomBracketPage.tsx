import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { bracketApi, errorMessage, fieldErrors } from '../services/api';
import { fetchMediaTitle } from '../services/oembed';
import { useAuth } from '../contexts/AuthContext';
import { TypeIcon } from '../components/BracketCard';
import type { BracketType } from '@/types';
import { randomId } from '@/utils/ids';
import {
  getSpotifyEmbedUrl, getYouTubeThumbnail, isSafeHttpsUrl, isSpotifyUrl, isYouTubeUrl, mediaUrlProblem,
} from '../utils/mediaUtils';

export interface Entry {
  id: string;
  title: string;
  mediaUrl: string;
  /** Who wrote the title: the user (never overwritten), an automatic lookup, or nobody yet. */
  titleSource: 'user' | 'auto' | null;
  status: 'idle' | 'fetching' | 'error';
  error?: string;
}

const LIMITS = { name: 100, description: 2000, title: 150, minEntries: 2, maxEntries: 500 };
const TITLE_LOOKUP_DELAY_MS = 400;
const YOUTUBE_LOOKUP_CONCURRENCY = 4;

const CATEGORIES = [
  'General', 'Music', 'TV', 'Movies', 'Sports', 'Gaming', 'Food', 'Travel', 'Art', 'Technology', 'Entertainment',
];

const newEntry = (fields: Partial<Entry> = {}): Entry =>
  ({ id: randomId(), title: '', mediaUrl: '', titleSource: null, status: 'idle', ...fields });

const isEmpty = (e: Entry) => !e.title.trim() && !e.mediaUrl.trim() && e.status === 'idle';

const typeLabel = (type: BracketType) => (type === 'video' ? 'Videos' : type === 'song' ? 'Songs' : 'Images');

const CustomBracketPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, signInWithGoogle } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<BracketType>('video');
  const [category, setCategory] = useState('General');
  const [entries, setEntries] = useState<Entry[]>(() => [newEntry(), newEntry()]);
  const [entryErrors, setEntryErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [playlistUrl, setPlaylistUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  const titleTimers = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; abort: AbortController }>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const timers = titleTimers.current;
    return () => {
      mounted.current = false;
      timers.forEach(({ timer, abort }) => { clearTimeout(timer); abort.abort(); });
    };
  }, []);

  const patch = (id: string, change: (e: Entry) => Partial<Entry>) =>
    setEntries(prev => prev.map(e => (e.id === id ? { ...e, ...change(e) } : e)));

  const cancelTitleLookup = (id: string) => {
    const pending = titleTimers.current.get(id);
    if (pending) {
      clearTimeout(pending.timer);
      pending.abort.abort();
      titleTimers.current.delete(id);
    }
  };

  /** Fills the title from the link, but only if the title is empty or was filled automatically. */
  const scheduleTitleLookup = (id: string, url: string) => {
    cancelTitleLookup(id);
    if (!isYouTubeUrl(url) && !isSpotifyUrl(url)) return;
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      let title: string | null = null;
      try {
        title = await fetchMediaTitle(url, abort.signal);
      } catch {
        // lookup failed: the user can type the title
      }
      if (!mounted.current || abort.signal.aborted) return;
      titleTimers.current.delete(id);
      setEntries(prev => prev.map(e => {
        // Drop the answer if the link changed meanwhile or the user wrote their own title.
        if (e.id !== id || e.mediaUrl !== url || !title) return e;
        if (e.titleSource === 'user' && e.title.trim()) return e;
        return { ...e, title: title.slice(0, LIMITS.title), titleSource: 'auto' };
      }));
    }, TITLE_LOOKUP_DELAY_MS);
    titleTimers.current.set(id, { timer, abort });
  };

  const onUrlChange = (id: string, url: string) => {
    patch(id, () => ({ mediaUrl: url, status: 'idle', error: undefined }));
    scheduleTitleLookup(id, url.trim());
  };

  const onTitleChange = (id: string, title: string) =>
    patch(id, () => ({ title, titleSource: title.trim() ? 'user' : null }));

  const removeEntry = (id: string) => {
    cancelTitleLookup(id);
    setEntries(prev => (prev.length > LIMITS.minEntries ? prev.filter(e => e.id !== id) : prev));
  };

  // ---- Playlist import -------------------------------------------------------------------

  const findYouTubeLinks = async (pending: Entry[]) => {
    const queue = [...pending];
    const worker = async () => {
      for (let entry = queue.shift(); entry; entry = queue.shift()) {
        const { id, title } = entry;
        let url: string | null = null;
        let failed = false;
        try {
          url = await bracketApi.searchYouTube(title);
        } catch {
          failed = true;
        }
        if (!mounted.current) return;
        setEntries(prev => prev.map(e => {
          if (e.id !== id || e.status !== 'fetching') return e; // removed or edited meanwhile
          return url
            ? { ...e, mediaUrl: url, status: 'idle', error: undefined }
            : { ...e, status: 'error', error: failed ? 'YouTube lookup failed, paste a link' : 'No YouTube match, paste a link' };
        }));
      }
    };
    await Promise.all(Array.from({ length: YOUTUBE_LOOKUP_CONCURRENCY }, worker));
  };

  const importPlaylist = async () => {
    const url = playlistUrl.trim();
    if (importing) return;
    if (!/^https:\/\/open\.spotify\.com\/(intl-[a-z-]+\/)?(embed\/)?playlist\//i.test(url)) {
      setImportMessage({ kind: 'error', text: 'Paste a Spotify playlist link, like https://open.spotify.com/playlist/…' });
      return;
    }
    setImporting(true);
    setImportMessage(null);
    try {
      const tracks = await bracketApi.getSpotifyPlaylist(url);
      if (!mounted.current) return;
      if (tracks.length === 0) {
        setImportMessage({ kind: 'info', text: 'This playlist has no tracks.' });
        return;
      }
      const imported = tracks.map(t => newEntry({
        title: t.title.slice(0, LIMITS.title),
        titleSource: 'user',
        mediaUrl: type === 'video' ? '' : t.mediaUrl,
        status: type === 'video' ? 'fetching' : 'idle',
      }));
      setEntries(prev => [...prev.filter(e => !isEmpty(e)), ...imported].slice(0, LIMITS.maxEntries));
      setPlaylistUrl('');
      setImportMessage({ kind: 'info', text: `Added ${imported.length} ${imported.length === 1 ? 'track' : 'tracks'}.` });
      if (type === 'video') await findYouTubeLinks(imported);
    } catch (error) {
      if (mounted.current) setImportMessage({ kind: 'error', text: errorMessage(error, 'The playlist couldn’t be imported.') });
    } finally {
      if (mounted.current) setImporting(false);
    }
  };

  // ---- Submit ----------------------------------------------------------------------------

  /** Client-side copy of the server's rules, so most mistakes are caught before sending. */
  const validate = (): { errors: Record<string, string>; message: string | null; filled: Entry[] } => {
    const errors: Record<string, string> = {};
    const filled = entries.filter(e => !isEmpty(e));
    filled.forEach(e => {
      const n = entries.indexOf(e) + 1;
      if (e.status === 'fetching' || (type === 'video' && e.status === 'error' && !e.mediaUrl.trim())) {
        errors[e.id] = `Entry ${n} has no YouTube link yet`;
      } else if (!e.mediaUrl.trim()) {
        errors[e.id] = `Entry ${n} needs a link`;
      } else if (!e.title.trim()) {
        errors[e.id] = `Entry ${n} needs a title`;
      } else if (e.title.trim().length > LIMITS.title) {
        errors[e.id] = `Entry ${n}: titles can be at most ${LIMITS.title} characters`;
      } else {
        const problem = mediaUrlProblem(e.mediaUrl, type);
        if (problem) errors[e.id] = `Entry ${n}: ${problem}`;
      }
    });
    let message: string | null = null;
    if (!name.trim()) message = 'Give the bracket a name';
    else if (name.trim().length > LIMITS.name) message = `The name can be at most ${LIMITS.name} characters`;
    else if (description.length > LIMITS.description) message = `The description can be at most ${LIMITS.description} characters`;
    else if (Object.keys(errors).length > 0) message = Object.values(errors)[0];
    else if (filled.length < LIMITS.minEntries) message = `Add at least ${LIMITS.minEntries} entries`;
    else if (filled.length > LIMITS.maxEntries) message = `A bracket can have at most ${LIMITS.maxEntries} entries`;
    return { errors, message, filled };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || submitting) return;
    const { errors, message, filled } = validate();
    setEntryErrors(errors);
    setFormError(message);
    if (message) return;

    setSubmitting(true);
    try {
      const bracket = await bracketApi.createBracket({
        name: name.trim(),
        description: description.trim() || undefined,
        type,
        category,
        items: filled.map(entry => ({ title: entry.title.trim(), mediaUrl: entry.mediaUrl.trim() })),
      });
      navigate(`/bracket/${bracket.id}`);
    } catch (error) {
      if (!mounted.current) return;
      // Map the server's per-field errors (items[i].x refers to the submitted list) back to rows.
      const server = fieldErrors(error);
      const byEntry: Record<string, string> = {};
      Object.entries(server).forEach(([field, text]) => {
        const m = /^items\[(\d+)\]/.exec(field);
        const entry = m ? filled[Number(m[1])] : undefined;
        if (entry) byEntry[entry.id] = text;
      });
      setEntryErrors(byEntry);
      setFormError(errorMessage(error, 'The bracket couldn’t be created. Please try again.'));
      setSubmitting(false);
    }
  };

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      setFormError(errorMessage(error, 'Sign-in failed. Please try again.'));
    }
  };

  const readyCount = entries.filter(e => !isEmpty(e) && e.title.trim() && e.mediaUrl.trim() && e.status !== 'fetching').length;

  return (
    <div className="page max-w-3xl pb-24 pt-10 sm:pt-14">
      <header className="mb-10">
        <h1 className="font-display text-[3rem] font-black leading-none text-themed-primary sm:text-[3.5rem]">
          Make a bracket
        </h1>
        <p className="mt-3 max-w-xl text-lg text-themed-secondary">
          Add at least two entries. Players see them two at a time and pick a winner until one is left.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-8" noValidate>
        <div>
          <label htmlFor="bracketName" className="field-label">Name</label>
          <input
            type="text"
            id="bracketName"
            value={name}
            maxLength={LIMITS.name}
            onChange={(e) => setName(e.target.value)}
            className="field text-base"
            placeholder={type === 'video' ? 'e.g. Best music videos of the 90s' : type === 'song' ? 'e.g. Best Radiohead songs' : 'e.g. Best album covers'}
            required
          />
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="bracketDescription" className="field-label">
              Description <span className="font-normal text-themed-tertiary">(optional)</span>
            </label>
            <span className="field-hint tabular">{description.length}/{LIMITS.description}</span>
          </div>
          <textarea
            id="bracketDescription"
            value={description}
            maxLength={LIMITS.description}
            rows={3}
            onChange={(e) => setDescription(e.target.value)}
            className="field resize-y"
            placeholder="What's this bracket about?"
          />
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-[1fr_14rem]">
          <fieldset>
            <legend className="field-label">What are people choosing between?</legend>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Bracket type">
              {(['video', 'song', 'image'] as const).map((t) => (
                <label key={t} className="choice flex cursor-pointer items-center justify-center gap-2 py-2.5">
                  <input type="radio" name="bracket-type" value={t} checked={type === t} onChange={() => setType(t)} className="sr-only" />
                  <TypeIcon type={t} className="h-5 w-5" />
                  {typeLabel(t)}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="bracketCategory" className="field-label">Category</label>
            <select id="bracketCategory" value={category} onChange={(e) => setCategory(e.target.value)} className="field">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {(type === 'song' || type === 'video') && (
          <div className="card p-4 sm:p-5">
            <div className="mb-1 flex items-center gap-2">
              <svg className="h-5 w-5 text-[#1DB954]" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.54.659.301 1.02zm1.44-3.3c-.301.42-.84.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.6.18-1.2.72-1.38 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.54-1.02.72-1.56.3z" />
              </svg>
              <label htmlFor="playlistUrl" className="font-semibold text-themed-primary">Fill from a Spotify playlist</label>
            </div>
            <p className="field-hint mb-3">
              {type === 'video'
                ? 'Each track is added as an entry, and we look up a YouTube video for it.'
                : 'Each track in the playlist is added as an entry.'}
            </p>
            <div className="flex gap-2">
              <input
                type="url"
                id="playlistUrl"
                value={playlistUrl}
                onChange={(e) => setPlaylistUrl(e.target.value)}
                onKeyDown={(e) => {
                  // Enter imports instead of submitting the whole form
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void importPlaylist();
                  }
                }}
                className="field flex-1"
                placeholder="https://open.spotify.com/playlist/…"
                disabled={importing}
              />
              <button
                type="button"
                onClick={() => void importPlaylist()}
                disabled={importing || !playlistUrl.trim()}
                className="btn shrink-0 border border-[#1DB954] bg-[#1DB954] text-[#0b1f12] hover:bg-[#1ed760]"
              >
                {importing ? <><span className="spinner" /> Importing…</> : 'Import'}
              </button>
            </div>
            {importMessage && (
              <p className={`mt-2 text-sm ${importMessage.kind === 'error' ? 'text-error' : 'text-themed-secondary'}`} role={importMessage.kind === 'error' ? 'alert' : 'status'}>
                {importMessage.text}
              </p>
            )}
          </div>
        )}

        <div>
          <div className="mb-1 flex items-baseline justify-between gap-4">
            <h2 className="font-display text-[2rem] font-extrabold leading-none text-themed-primary">Entries</h2>
            <span className="text-sm text-themed-tertiary tabular">{readyCount} ready</span>
          </div>
          <p className="field-hint mb-5">
            {type === 'image'
              ? 'Paste an https link to each image.'
              : type === 'song'
                ? 'Paste a Spotify link (or an https link to an audio file) and the title fills itself in.'
                : 'Paste a YouTube link and the title fills itself in.'}
          </p>

          <ol className="space-y-3">
            {entries.map((entry, index) => {
              const error = entryErrors[entry.id] ?? (entry.status === 'error' ? entry.error : undefined);
              return (
                <li key={entry.id} className="card flex gap-3 p-4 sm:gap-4">
                  <span className="w-7 shrink-0 pt-6 text-right font-display text-2xl font-extrabold leading-none text-themed-tertiary tabular" aria-hidden="true">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <label htmlFor={`item-url-${entry.id}`} className="field-label flex items-center gap-2 text-sm">
                          {type === 'song' ? 'Spotify or audio link' : type === 'video' ? 'YouTube link' : 'Image link'}
                          {entry.status === 'fetching' && (
                            <span className="inline-flex items-center gap-1.5 font-normal text-themed-tertiary">
                              <span className="spinner" style={{ width: '0.75rem', height: '0.75rem' }} />
                              Finding a video…
                            </span>
                          )}
                        </label>
                        <input
                          id={`item-url-${entry.id}`}
                          type="url"
                          value={entry.mediaUrl}
                          maxLength={2000}
                          onChange={(e) => onUrlChange(entry.id, e.target.value)}
                          className="field"
                          placeholder="https://"
                          aria-invalid={Boolean(error)}
                          aria-describedby={error ? `item-error-${entry.id}` : undefined}
                        />
                      </div>
                      <div>
                        <label htmlFor={`item-title-${entry.id}`} className="field-label text-sm">Title</label>
                        <input
                          id={`item-title-${entry.id}`}
                          type="text"
                          value={entry.title}
                          maxLength={LIMITS.title}
                          onChange={(e) => onTitleChange(entry.id, e.target.value)}
                          className="field"
                          placeholder={`${type === 'song' ? 'Song' : type === 'video' ? 'Video' : 'Image'} title`}
                        />
                      </div>
                    </div>
                    {error && (
                      <p id={`item-error-${entry.id}`} className="mt-2 text-sm text-error">{error}</p>
                    )}
                    <EntryPreview url={entry.mediaUrl.trim()} type={type} label={`Preview of entry ${index + 1}`} />
                  </div>
                  {entries.length > LIMITS.minEntries && (
                    <button
                      type="button"
                      onClick={() => removeEntry(entry.id)}
                      className="btn btn-ghost -mr-1 -mt-1 h-9 w-9 shrink-0 self-start p-0"
                      aria-label={`Remove entry ${index + 1}`}
                      title="Remove entry"
                    >
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </li>
              );
            })}
          </ol>

          <button
            type="button"
            onClick={() => setEntries(prev => (prev.length < LIMITS.maxEntries ? [...prev, newEntry()] : prev))}
            disabled={entries.length >= LIMITS.maxEntries}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-themed-secondary py-3 font-semibold text-themed-secondary transition-colors duration-150 hover:bg-themed-tertiary hover:text-themed-primary disabled:opacity-50"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <span>Add entry</span>
          </button>
        </div>

        {formError && (
          <div className="notice notice-error" role="alert">
            <p className="text-themed-primary">{formError}</p>
          </div>
        )}

        {!currentUser && (
          <div className="notice notice-warning">
            <p className="font-semibold text-themed-primary">Sign in to publish</p>
            <p className="mt-0.5">
              You can fill everything in now. You’ll need to be signed in before the bracket can be created.
            </p>
            <button type="button" onClick={() => void handleSignIn()} className="mt-2 font-semibold text-themed-primary underline underline-offset-4">
              Sign in with Google
            </button>
          </div>
        )}

        <div className="flex flex-col-reverse gap-3 border-t border-themed-primary pt-6 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => navigate('/')} className="btn btn-secondary btn-lg" disabled={submitting}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary btn-lg sm:min-w-[14rem]"
            disabled={submitting || !currentUser}
            title={!currentUser ? 'Sign in to create a bracket' : undefined}
          >
            {submitting ? <><span className="spinner" /><span>Creating…</span></> : !currentUser ? 'Sign in to create' : 'Create bracket'}
          </button>
        </div>
      </form>
    </div>
  );
};

/** A light preview of one entry's link: thumbnails instead of full players. */
const EntryPreview: React.FC<{ url: string; type: BracketType; label: string }> = ({ url, type, label }) => {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!url || !isSafeHttpsUrl(url) || failedUrl === url) return null;

  if (type === 'video') {
    const thumbnail = getYouTubeThumbnail(url);
    return thumbnail ? (
      <img src={thumbnail} alt={label} className="mt-3 h-24 w-40 rounded object-cover" loading="lazy" onError={() => setFailedUrl(url)} />
    ) : null;
  }
  if (type === 'song') {
    const embed = getSpotifyEmbedUrl(url);
    if (embed) {
      return <iframe src={embed} title={label} height="80" className="mt-3 w-full rounded border-0" loading="lazy" allow="encrypted-media" />;
    }
    return isSpotifyUrl(url) ? null : <audio controls preload="none" src={url} className="mt-3 h-8 w-full" />;
  }
  return <img src={url} alt={label} className="mt-3 h-32 w-full rounded object-cover" loading="lazy" onError={() => setFailedUrl(url)} />;
};

export default CustomBracketPage;
