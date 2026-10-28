import type { BracketType } from '@/types';

/**
 * Media link helpers. The URL rules mirror the backend's MediaUrlValidator/MediaUrls so the
 * create form rejects the same links the server would.
 */

const YOUTUBE_HOSTS = new Set([
  'youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com',
  'youtube-nocookie.com', 'www.youtube-nocookie.com',
]);
const YOUTUBE_PATH_PREFIXES = new Set(['shorts', 'live', 'embed', 'v']);
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const SPOTIFY_PATH = /^(?:\/intl-[A-Za-z-]+)?(?:\/embed)?\/(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]{1,64})\/?$/;
const BLOCKED_HOSTS = new Set(['localhost', 'metadata', 'metadata.google.internal']);
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal'];

export const MAX_URL_LENGTH = 2000;

function parse(url: string | null | undefined): URL | null {
  if (!url) return null;
  try {
    return new URL(url.trim());
  } catch {
    return null;
  }
}

/** An https URL, which is all the page's CSP lets images, audio and embeds load. */
export function isSafeHttpsUrl(url: string | null | undefined): boolean {
  return parse(url)?.protocol === 'https:';
}

/** The 11-character id of a YouTube watch/short/live/embed/youtu.be link, else null. */
export function youTubeVideoId(url: string | null | undefined): string | null {
  const u = parse(url);
  if (!u || (u.protocol !== 'https:' && u.protocol !== 'http:')) return null;
  const host = u.hostname.toLowerCase();
  const segments = u.pathname.replace(/^\//, '').split('/');
  let candidate: string | null = null;
  if (host === 'youtu.be') {
    candidate = segments[0];
  } else if (YOUTUBE_HOSTS.has(host)) {
    if (u.pathname === '/watch' || u.pathname === '/watch/') {
      candidate = rawQueryParam(u.search, 'v');
    } else if (segments.length >= 2 && YOUTUBE_PATH_PREFIXES.has(segments[0])) {
      candidate = segments[1];
    }
  }
  return candidate && YOUTUBE_ID.test(candidate) ? candidate : null;
}

/** A query parameter as written, without percent-decoding (the server reads the raw query). */
function rawQueryParam(search: string, name: string): string | null {
  for (const pair of search.replace(/^\?/, '').split('&')) {
    const eq = pair.indexOf('=');
    if (eq > 0 && pair.slice(0, eq) === name) return pair.slice(eq + 1);
  }
  return null;
}

export function isYouTubeUrl(url: string | null | undefined): boolean {
  return youTubeVideoId(url) !== null;
}

export function isSpotifyUrl(url: string | null | undefined): boolean {
  return parse(url)?.hostname.toLowerCase() === 'open.spotify.com';
}

export function isSpotifyShortLink(url: string | null | undefined): boolean {
  const host = parse(url)?.hostname.toLowerCase() ?? '';
  return host === 'spotify.link' || host.endsWith('.spotify.link');
}

/** {kind, id} of an embeddable open.spotify.com link (an intl-xx segment is skipped). */
export function spotifyResource(url: string | null | undefined): { kind: string; id: string } | null {
  const u = parse(url);
  if (!u || u.hostname.toLowerCase() !== 'open.spotify.com') return null;
  const m = SPOTIFY_PATH.exec(u.pathname);
  return m ? { kind: m[1], id: m[2] } : null;
}

export function getSpotifyEmbedUrl(url: string): string | null {
  const r = spotifyResource(url);
  return r ? `https://open.spotify.com/embed/${r.kind}/${r.id}?utm_source=generator` : null;
}

export function getYouTubeEmbedUrl(url: string, autoplay = true): string | null {
  const id = youTubeVideoId(url);
  if (!id) return null;
  const origin = typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : '';
  return `https://www.youtube.com/embed/${id}?enablejsapi=1&autoplay=${autoplay ? 1 : 0}&mute=1&controls=1&modestbranding=1&rel=0&playsinline=1&origin=${origin}`;
}

export function getYouTubeThumbnail(url: string): string | null {
  const id = youTubeVideoId(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
}

/**
 * Why a media URL can't be used for an entry of the given type, or null if it's fine. DNS-based
 * checks (hosts that resolve to private addresses) only happen on the server.
 */
export function mediaUrlProblem(url: string, type: BracketType): string | null {
  const trimmed = url.trim();
  if (!trimmed) return 'Add a link';
  if (trimmed.length > MAX_URL_LENGTH) return `Links can be at most ${MAX_URL_LENGTH} characters`;
  if (/\s/.test(trimmed)) return 'Links can’t contain spaces';
  const u = parse(trimmed);
  if (!u) return 'This isn’t a valid link';
  if (u.protocol !== 'https:') return 'Links must start with https://';
  if (u.username || u.password) return 'Links can’t contain a user name or password';
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (BLOCKED_HOSTS.has(host) || BLOCKED_SUFFIXES.some(s => host.endsWith(s)) || isPrivateIpLiteral(host)) {
    return 'Links must point to a public website';
  }
  if (type === 'video' && !isYouTubeUrl(trimmed)) {
    return 'Video entries need a YouTube link (youtube.com/watch?v=…, youtu.be/…, /shorts/…)';
  }
  if (type === 'song') {
    if (isSpotifyShortLink(trimmed)) {
      return 'Spotify short links (spotify.link) can’t be embedded; open the link and copy the open.spotify.com address';
    }
    if (isSpotifyUrl(trimmed) && !spotifyResource(trimmed)) {
      return 'Use a Spotify track, album, playlist or episode link';
    }
  }
  return null;
}

function isPrivateIpLiteral(host: string): boolean {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127);
  }
  if (host.includes(':')) {
    return host === '::1' || host === '::' || /^f[cd]/.test(host) || /^fe[89ab]/.test(host) || host.startsWith('ff')
      || host.startsWith('::ffff:');
  }
  // Numeric-looking hosts like 2130706433 or 0x7f.1 are IP addresses to a browser.
  const last = host.split('.').pop() ?? '';
  return /^(0x[0-9a-f]*|\d+)$/.test(last);
}
