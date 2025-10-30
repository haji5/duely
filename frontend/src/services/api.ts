import axios from 'axios';
import { Bracket, Item, Result, ItemRanking } from '@/types';
import { auth } from '@/config/firebase';
import { apiCache, cachedApiCall, createCacheKey } from '@/utils/apiCache';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Provide a way to clear any cached state when logging out
export function resetApiAuthState() {
  // Clear all cached API data on logout
  apiCache.clear();
  // If we ever add default Authorization headers, clear them here as well
  if (api.defaults.headers && 'Authorization' in api.defaults.headers.common) {
    delete (api.defaults.headers.common as any)['Authorization'];
  }
}

api.interceptors.request.use(async (config) => {
  // Attach Firebase ID token if available
  const user = auth.currentUser;
  console.log('[API Interceptor] Current user:', user ? user.uid : 'No user');

  if (user) {
    try {
      // Force token refresh to ensure it's valid
      const idToken = await user.getIdToken(true);
      console.log('[API Interceptor] Got ID token, length:', idToken?.length);
      config.headers = config.headers || {};
      (config.headers as any)['Authorization'] = `Bearer ${idToken}`;
    } catch (error) {
      console.error('[API Interceptor] Failed to get Firebase ID token:', error);
      // If we can't get the token, proceed without it
      // This will result in 401 for protected routes, which is expected
    }
  } else {
    console.warn('[API Interceptor] No Firebase user available for request to:', config.url);
  }

  return config;
});

export const bracketApi = {
  // Get all brackets (cached for 5 minutes)
  getAllBrackets: async (): Promise<Bracket[]> => {
    const cacheKey = createCacheKey('/brackets');
    return cachedApiCall(cacheKey, async () => {
      const response = await api.get('/brackets');
      return response.data;
    }, 5 * 60 * 1000); // 5 minutes
  },

  // Get bracket by ID (cached for 15 minutes)
  getBracket: async (id: number): Promise<Bracket> => {
    const cacheKey = createCacheKey(`/brackets/${id}`);
    return cachedApiCall(cacheKey, async () => {
      const response = await api.get(`/brackets/${id}`);
      return response.data;
    }, 15 * 60 * 1000); // 15 minutes
  },

  // Get bracket items (cached for 15 minutes)
  getBracketItems: async (id: number): Promise<Item[]> => {
    const cacheKey = createCacheKey(`/brackets/${id}/items`);
    return cachedApiCall(cacheKey, async () => {
      const response = await api.get(`/brackets/${id}/items`);
      return response.data;
    }, 15 * 60 * 1000); // 15 minutes
  },

  // Save bracket result (userId derived on backend)
  saveBracketResult: async (id: number, ranking: number[], submissionToken?: string): Promise<Result> => {
    // Generate a unique submission token if not provided (to prevent duplicate submissions)
    const token = submissionToken || `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

    const response = await api.post(`/brackets/${id}/results`, {
      ranking,
      submissionToken: token,
    });
    
    // Invalidate ONLY the specific bracket's caches (not all brackets!)
    apiCache.invalidate(createCacheKey(`/brackets/${id}/results`));
    apiCache.invalidate(createCacheKey(`/brackets/${id}/rankings`));

    // Invalidate user-specific caches if user is logged in
    const user = auth.currentUser;
    if (user) {
      // Use the new cache key format (my-results instead of user ID in key)
      apiCache.invalidate(createCacheKey(`/brackets/${id}/my-results`));
      apiCache.invalidate(createCacheKey('/my-results'));
    }

    // Only invalidate popular brackets if this might affect the list
    // (popular brackets are determined by result count, so this is relevant)
    apiCache.invalidate(createCacheKey('/brackets/popular'));
    
    return response.data;
  },

  // Get bracket results (cached for 2 minutes - frequently updated)
  getBracketResults: async (id: number): Promise<Result[]> => {
    const cacheKey = createCacheKey(`/brackets/${id}/results`);
    return cachedApiCall(cacheKey, async () => {
      const response = await api.get(`/brackets/${id}/results`);
      return response.data;
    }, 2 * 60 * 1000); // 2 minutes
  },

  // Get user-specific results for a bracket (cached for 5 minutes)
  // SECURITY: Only allow fetching results for the currently authenticated user
  getUserBracketResults: async (bracketId: number, userId: string): Promise<Result[]> => {
    const currentUser = auth.currentUser;

    // Validate that the requested userId matches the current user
    if (!currentUser || currentUser.uid !== userId) {
      throw new Error('Unauthorized: Cannot fetch results for another user');
    }

    // Use authenticated user's UID in cache key, not the parameter
    // This prevents cache poisoning if userId parameter is manipulated
    const cacheKey = createCacheKey(`/brackets/${bracketId}/my-results`);
    return cachedApiCall(cacheKey, async () => {
      const response = await api.get(`/brackets/${bracketId}/users/${userId}/results`);
      return response.data;
    }, 5 * 60 * 1000); // 5 minutes
  },

  // Get all results for a specific user (cached for 5 minutes)
  // SECURITY: Only allow fetching results for the currently authenticated user
  getUserResults: async (userId: string): Promise<Result[]> => {
    const currentUser = auth.currentUser;

    // Validate that the requested userId matches the current user
    if (!currentUser || currentUser.uid !== userId) {
      throw new Error('Unauthorized: Cannot fetch results for another user');
    }

    // Use authenticated user's UID in cache key, not the parameter
    const cacheKey = createCacheKey('/my-results');
    return cachedApiCall(cacheKey, async () => {
      const response = await api.get(`/users/${userId}/results`);
      return response.data;
    }, 5 * 60 * 1000); // 5 minutes
  },

  // Get popular brackets (cached for 10 minutes)
  getPopularBrackets: async (): Promise<Bracket[]> => {
    const cacheKey = createCacheKey('/brackets/popular');
    return cachedApiCall(cacheKey, async () => {
      const response = await api.get('/brackets/popular');
      return response.data;
    }, 10 * 60 * 1000); // 10 minutes
  },

  // Get pre-calculated rankings from server (cached for 5 minutes)
  getBracketRankings: async (id: number): Promise<ItemRanking[]> => {
    const cacheKey = createCacheKey(`/brackets/${id}/rankings`);
    return cachedApiCall(cacheKey, async () => {
      const response = await api.get(`/brackets/${id}/rankings`);
      return response.data;
    }, 5 * 60 * 1000); // 5 minutes
  },

  // Create new bracket
  createBracket: async (name: string, description: string, type: string, category?: string): Promise<Bracket> => {
    const response = await api.post('/brackets', {
      name,
      description,
      type,
      category: category || 'General',
    });
    
    // Invalidate relevant caches - user will see their new bracket immediately
    apiCache.invalidate(createCacheKey('/brackets'));
    apiCache.invalidate(createCacheKey('/brackets/popular'));

    // Invalidate user's own brackets cache
    const user = auth.currentUser;
    if (user) {
      apiCache.invalidate(createCacheKey(`/brackets/by-creator/${user.uid}`));
    }

    return response.data;
  },

  // Get brackets by creator ID (NOT cached - for immediate "My Brackets" visibility)
  getBracketsByCreator: async (creatorId: string): Promise<Bracket[]> => {
    const response = await api.get(`/brackets/by-creator/${creatorId}`);
    return response.data;
  },

  // Add item to bracket
  addItemToBracket: async (
    bracketId: number,
    title: string,
    mediaUrl: string,
    mediaType: string
  ): Promise<Item> => {
    const response = await api.post(`/brackets/${bracketId}/items`, {
      title,
      mediaUrl,
      mediaType,
    });
    
    // Invalidate bracket items cache
    apiCache.invalidate(createCacheKey(`/brackets/${bracketId}/items`));
    apiCache.invalidate(createCacheKey(`/brackets/${bracketId}`));
    
    return response.data;
  },

  // Bulk add items to bracket (MUCH more efficient than individual calls)
  bulkAddItemsToBracket: async (
    bracketId: number,
    items: Array<{
      title: string;
      mediaUrl: string;
      mediaType: string;
    }>
  ): Promise<{ items: Item[]; count: number; message: string }> => {
    const response = await api.post(`/brackets/${bracketId}/items/bulk`, {
      items,
    });

    // Invalidate bracket items cache
    apiCache.invalidate(createCacheKey(`/brackets/${bracketId}/items`));
    apiCache.invalidate(createCacheKey(`/brackets/${bracketId}`));

    return response.data;
  },

  // Create bracket with items (optional helper if supported)
  createBracketWithItems: async (payload: {
    name: string;
    type: string;
    items: Array<{
      title: string;
      mediaUrl: string;
      mediaType: string;
    }>;
  }): Promise<Bracket> => {
    const response = await api.post('/brackets', payload);
    
    // Invalidate brackets list cache
    apiCache.invalidate(createCacheKey('/brackets'));
    apiCache.invalidate(createCacheKey('/brackets/popular'));
    
    return response.data;
  },
};

export default api;
