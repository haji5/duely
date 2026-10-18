import axios from 'axios';
import type {
  Bracket, Comment, CreateBracketPayload, Item, ItemRanking, MatchOutcome, PlaylistTrack, Result,
} from '@/types';
import { auth } from '@/config/firebase';
import { apiCache } from '@/utils/apiCache';

export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Firebase's getIdToken() returns the cached token and refreshes it shortly before it expires.
api.interceptors.request.use(async (config) => {
  const token = await auth.currentUser?.getIdToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
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
    if (!error.response) return 'Can’t reach the server. Check your connection and try again.';
  }
  return fallback;
}

/** Per-field messages from a 400 response ({"items[0].mediaUrl": "..."}), if any. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (axios.isAxiosError(error)) {
    const errors = (error.response?.data as { errors?: unknown } | undefined)?.errors;
    if (errors && typeof errors === 'object') return errors as Record<string, string>;
  }
  return {};
}

export function errorStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}

const MINUTE = 60_000;

const keys = {
  brackets: '/brackets',
  popular: '/brackets/popular',
  bracket: (id: number) => `/brackets/${id}`,
  items: (id: number) => `/brackets/${id}/items`,
  rankings: (id: number) => `/brackets/${id}/rankings`,
  comments: (id: number) => `/brackets/${id}/comments`,
  // Per-user keys include the uid so a response that lands after a sign-out can't be shown
  // to the next user.
  myResults: (uid: string, bracketId?: number) => `/me/results:${uid}:${bracketId ?? 'all'}`,
};

async function get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const response = await api.get<T>(path, { params });
  return response.data;
}

export const bracketApi = {
  getAllBrackets: (): Promise<Bracket[]> =>
    apiCache.getOrLoad(keys.brackets, 2 * MINUTE, () => get<Bracket[]>('/brackets')),

  getPopularBrackets: (): Promise<Bracket[]> =>
    apiCache.getOrLoad(keys.popular, 5 * MINUTE, () => get<Bracket[]>('/brackets/popular')),

  getBracket: (id: number): Promise<Bracket> =>
    apiCache.getOrLoad(keys.bracket(id), 15 * MINUTE, () => get<Bracket>(`/brackets/${id}`)),

  getBracketItems: (id: number): Promise<Item[]> =>
    apiCache.getOrLoad(keys.items(id), 15 * MINUTE, () => get<Item[]>(`/brackets/${id}/items`)),

  // Rankings and comments change with every run, so they are always fetched fresh.
  getBracketRankings: (id: number): Promise<ItemRanking[]> => get<ItemRanking[]>(`/brackets/${id}/rankings`),

  getBracketComments: (id: number): Promise<Comment[]> => get<Comment[]>(`/brackets/${id}/comments`),

  saveBracketResult: async (
    bracketId: number,
    run: { ranking: number[]; matches: MatchOutcome[]; submissionToken: string; displayName?: string; comment?: string },
  ): Promise<Result> => {
    const response = await api.post<Result>(`/brackets/${bracketId}/results`, run);
    const uid = auth.currentUser?.uid;
    if (uid) {
      apiCache.invalidate(keys.myResults(uid), keys.myResults(uid, bracketId));
    }
    return response.data;
  },

  /** Creates the bracket and all of its entries in one request. */
  createBracket: async (payload: CreateBracketPayload): Promise<Bracket> => {
    const response = await api.post<Bracket>('/brackets', payload);
    apiCache.invalidate(keys.brackets, keys.popular);
    return response.data;
  },

  /** The signed-in user's brackets, newest first. Not cached, so new brackets show at once. */
  getMyBrackets: (): Promise<Bracket[]> => get<Bracket[]>('/me/brackets'),

  /** The signed-in user's runs (optionally for one bracket), oldest first. */
  getMyResults: (bracketId?: number): Promise<Result[]> => {
    const uid = auth.currentUser?.uid;
    if (!uid) return Promise.resolve([]);
    return apiCache.getOrLoad(keys.myResults(uid, bracketId), 5 * MINUTE,
      () => get<Result[]>('/me/results', bracketId === undefined ? undefined : { bracketId }));
  },

  /** The first embeddable YouTube video for a search, or null if none was found. */
  searchYouTube: async (query: string): Promise<string | null> => {
    try {
      const data = await get<{ mediaUrl: string }>('/metadata/youtube/search', { query });
      return data.mediaUrl;
    } catch (error) {
      if (errorStatus(error) === 404) return null;
      throw error;
    }
  },

  getSpotifyPlaylist: (url: string): Promise<PlaylistTrack[]> =>
    get<PlaylistTrack[]>('/metadata/spotify/playlist', { url }),
};
