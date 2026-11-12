import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type {
  Bracket, BracketPage, BracketQuery, BracketStats, Comment, CreateBracketPayload, HomeLists, Item, ItemRanking,
  MatchOutcome, PlaylistTrack, Report, ReportTargetType, Result, RunTicket,
} from '@/types';
import { currentFirebaseUser } from '@/config/firebase';
import { apiCache } from '@/utils/apiCache';

export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

/** Endpoints that wait on third parties (YouTube, Spotify, DNS) get longer than the default. */
const SLOW_REQUEST_TIMEOUT_MS = 30_000;

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  // Without a timeout a stalled connection leaves a spinner forever instead of an error with a retry.
  timeout: 15_000,
});

// Firebase's getIdToken() returns the cached token and refreshes it shortly before it expires.
api.interceptors.request.use(async (config) => {
  const token = await currentFirebaseUser()?.getIdToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

type RetriableConfig = InternalAxiosRequestConfig & { authRetried?: boolean };

// The server answers 401 to a write whose token it cannot verify (expired while the tab slept,
// revoked, clock skew) rather than silently treating the player as a guest. Force a fresh token
// and retry once; if that fails too, the caller sees the original error.
api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as RetriableConfig | undefined;
  const user = currentFirebaseUser();
  if (error.response?.status !== 401 || !config || config.authRetried || !config.headers?.Authorization || !user) {
    throw error;
  }
  config.authRetried = true;
  try {
    await user.getIdToken(true);
  } catch {
    throw error;
  }
  return api.request(config);
});

/** Drops cached responses; called whenever the signed-in user changes. */
export function resetApiAuthState(): void {
  apiCache.clear();
}

/** The server's error message for a failed request, or a generic one. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: unknown } | undefined)?.message;
    if (typeof message === 'string' && message.trim()) return message;
    if (error.code === 'ECONNABORTED') return 'The server took too long to answer. Please try again.';
    if (!error.response) return 'Can’t reach the server. Check your connection and try again.';
  }
  return fallback;
}

/** Per-field messages from a 400 response ({"items[0].mediaUrl": "..."}), if any. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (axios.isAxiosError(error)) {
    const errors = (error.response?.data as { errors?: unknown } | undefined)?.errors;
    if (errors && typeof errors === 'object' && !Array.isArray(errors)) return errors as Record<string, string>;
  }
  return {};
}

export function errorStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}

const MINUTE = 60_000;

/** Drops cached lists, which any bracket appearing or going changes. */
function forgetLists(): void {
  apiCache.invalidatePrefix(keys.listPrefix);
  apiCache.invalidate(keys.home);
}

/** Drops what is cached about a bracket whose visibility or existence changed. */
function forgetBracket(id: number): void {
  forgetLists();
  apiCache.invalidate(keys.bracket(id), keys.items(id));
}

/** The query string for a bracket list, with unset values left out so equal queries share a key. */
function listParams(query: BracketQuery): Record<string, string> {
  const params: Record<string, string> = {};
  if (query.sort && query.sort !== 'newest') params.sort = query.sort;
  if (query.type) params.type = query.type;
  if (query.category) params.category = query.category;
  const q = query.q?.trim();
  if (q) params.q = q;
  if (query.page) params.page = String(query.page);
  if (query.size) params.size = String(query.size);
  return params;
}

const keys = {
  listPrefix: '/brackets?',
  list: (params: Record<string, string>) => `/brackets?${new URLSearchParams(Object.entries(params).sort()).toString()}`,
  home: '/home',
  bracket: (id: number) => `/brackets/${id}`,
  items: (id: number) => `/brackets/${id}/items`,
  rankings: (id: number) => `/brackets/${id}/rankings`,
  comments: (id: number) => `/brackets/${id}/comments`,
  // Per-user keys include the uid so a response that lands after a sign-out can't be shown
  // to the next user.
  myResults: (uid: string, bracketId: number) => `/me/results:${uid}:${bracketId}`,
};

async function get<T>(path: string, params?: Record<string, unknown>, timeout?: number): Promise<T> {
  const response = await api.get<T>(path, { params, timeout });
  return response.data;
}

export const bracketApi = {
  /** A page of the public brackets, filtered and sorted by the server. */
  listBrackets: (query: BracketQuery = {}): Promise<BracketPage> => {
    const params = listParams(query);
    return apiCache.getOrLoad(keys.list(params), MINUTE, () => get<BracketPage>('/brackets', params));
  },

  /** The home page's lists in one request. */
  getHome: (): Promise<HomeLists> =>
    apiCache.getOrLoad(keys.home, 2 * MINUTE, () => get<HomeLists>('/home')),

  getBracket: (id: number): Promise<Bracket> =>
    apiCache.getOrLoad(keys.bracket(id), 15 * MINUTE, () => get<Bracket>(`/brackets/${id}`)),

  getBracketItems: (id: number): Promise<Item[]> =>
    apiCache.getOrLoad(keys.items(id), 15 * MINUTE, () => get<Item[]>(`/brackets/${id}/items`)),

  // Rankings and comments change with every run, so they are always fetched fresh.
  getBracketRankings: (id: number): Promise<ItemRanking[]> => get<ItemRanking[]>(`/brackets/${id}/rankings`),

  getBracketStats: (id: number): Promise<BracketStats> => get<BracketStats>(`/brackets/${id}/stats`),

  getBracketComments: (id: number): Promise<Comment[]> => get<Comment[]>(`/brackets/${id}/comments`),

  /** Starts a run: the server picks the entrants and signs them into a ticket. */
  startRun: async (bracketId: number, size: number): Promise<RunTicket> => {
    const response = await api.post<RunTicket>(`/brackets/${bracketId}/runs`, { size });
    return response.data;
  },

  /**
   * Saves a finished run. The ticket makes retries idempotent; the server derives the ranking
   * from the matches and returns it.
   */
  saveBracketResult: async (
    bracketId: number,
    run: { ticket: string; matches: MatchOutcome[]; displayName?: string; comment?: string },
  ): Promise<Result> => {
    const response = await api.post<Result>(`/brackets/${bracketId}/results`, run);
    const uid = currentFirebaseUser()?.uid;
    if (uid) {
      apiCache.invalidate(keys.myResults(uid, bracketId));
    }
    return response.data;
  },

  /** Creates the bracket and all of its entries in one request. */
  createBracket: async (payload: CreateBracketPayload): Promise<Bracket> => {
    const response = await api.post<Bracket>('/brackets', payload, { timeout: SLOW_REQUEST_TIMEOUT_MS });
    forgetLists();
    return response.data;
  },

  /** Deletes one of the signed-in user's brackets (admins: any), with its runs and rankings. */
  deleteBracket: async (id: number): Promise<void> => {
    await api.delete(`/brackets/${id}`);
    forgetBracket(id);
    const uid = currentFirebaseUser()?.uid;
    if (uid) apiCache.invalidate(keys.myResults(uid, id));
  },

  /** Reports a bracket or a comment to the moderators. Open to guests. */
  report: async (report: { targetType: ReportTargetType; targetId: number; reason: string; details?: string }): Promise<void> => {
    await api.post('/reports', report);
  },

  /**
   * Deletes what Duely keeps about the signed-in user: brackets nobody else has played, and the
   * name and comment on their runs, which stay on the leaderboards anonymously.
   */
  deleteMyData: async (): Promise<void> => {
    await api.delete('/me');
    apiCache.clear();
  },

  /** A page of the signed-in user's brackets, hidden and unplayable ones included. Not cached, so new brackets show at once. */
  getMyBrackets: (query: BracketQuery = {}): Promise<BracketPage> => get<BracketPage>('/me/brackets', listParams(query)),

  /** The signed-in user's latest runs (at most 100) of one bracket, oldest first. */
  getMyResults: (bracketId: number): Promise<Result[]> => {
    const uid = currentFirebaseUser()?.uid;
    if (!uid) return Promise.resolve([]);
    return apiCache.getOrLoad(keys.myResults(uid, bracketId), 5 * MINUTE, () => get<Result[]>('/me/results', { bracketId }));
  },

  /** The first embeddable YouTube video for a search, or null if none was found. */
  searchYouTube: async (query: string): Promise<string | null> => {
    try {
      const data = await get<{ mediaUrl: string }>('/metadata/youtube/search', { query }, SLOW_REQUEST_TIMEOUT_MS);
      return data.mediaUrl;
    } catch (error) {
      if (errorStatus(error) === 404) return null;
      throw error;
    }
  },

  getSpotifyPlaylist: (url: string): Promise<PlaylistTrack[]> =>
    get<PlaylistTrack[]>('/metadata/spotify/playlist', { url }, SLOW_REQUEST_TIMEOUT_MS),
};

/** Moderation. The server checks the admin claim on every call; the UI only hides the controls. */
export const adminApi = {
  /** Newest first; open ones only unless `open` is false. */
  getReports: (open = true): Promise<Report[]> => get<Report[]>('/admin/reports', { open }),

  resolveReport: async (id: number): Promise<void> => {
    await api.post(`/admin/reports/${id}/resolve`);
  },

  hideBracket: async (id: number): Promise<void> => {
    await api.post(`/admin/brackets/${id}/hide`);
    forgetBracket(id);
  },

  unhideBracket: async (id: number): Promise<void> => {
    await api.post(`/admin/brackets/${id}/unhide`);
    forgetBracket(id);
  },

  /** Clears a comment and its display name; the run stays. */
  clearComment: async (resultId: number): Promise<void> => {
    await api.delete(`/admin/results/${resultId}/comment`);
  },

  /** Deletes a run; the server rebuilds the bracket's leaderboard without it. */
  deleteResult: async (resultId: number): Promise<void> => {
    await api.delete(`/admin/results/${resultId}`);
  },
};
