import axios from 'axios';
import { Bracket, Item, Result } from '@/types';
import { auth } from '@/config/firebase';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

let csrfToken: string | null = null;

async function ensureCsrfToken() {
  try {
    if (!csrfToken) {
      const res = await api.get('/csrf-token');
      csrfToken = res.data?.token || null;
    }
  } catch {
    // ignore; backend may not require CSRF on GET
  }
}

// Provide a way to clear any cached state when logging out
export function resetApiAuthState() {
  csrfToken = null;
  // If we ever add default Authorization headers, clear them here as well
  if (api.defaults.headers && 'Authorization' in api.defaults.headers.common) {
    delete (api.defaults.headers.common as any)['Authorization'];
  }
}

api.interceptors.request.use(async (config) => {
  // Attach Firebase ID token if available
  const user = auth.currentUser;
  if (user) {
    const idToken = await user.getIdToken();
    config.headers = config.headers || {};
    (config.headers as any)['Authorization'] = `Bearer ${idToken}`;
  }
  // Ensure CSRF header for state-changing methods
  const method = (config.method || 'get').toLowerCase();
  if (['post', 'put', 'patch', 'delete'].includes(method)) {
    await ensureCsrfToken();
    if (csrfToken) {
      config.headers = config.headers || {};
      (config.headers as any)['X-XSRF-TOKEN'] = csrfToken;
    }
  }
  return config;
});

export const bracketApi = {
  // Get all brackets
  getAllBrackets: async (): Promise<Bracket[]> => {
    const response = await api.get('/brackets');
    return response.data;
  },

  // Get bracket by ID
  getBracket: async (id: number): Promise<Bracket> => {
    const response = await api.get(`/brackets/${id}`);
    return response.data;
  },

  // Get bracket items
  getBracketItems: async (id: number): Promise<Item[]> => {
    const response = await api.get(`/brackets/${id}/items`);
    return response.data;
  },

  // Save bracket result (userId derived on backend)
  saveBracketResult: async (id: number, ranking: number[]): Promise<Result> => {
    const response = await api.post(`/brackets/${id}/results`, {
      ranking,
    });
    return response.data;
  },

  // Get bracket results
  getBracketResults: async (id: number): Promise<Result[]> => {
    const response = await api.get(`/brackets/${id}/results`);
    return response.data;
  },

  // Get user-specific results for a bracket
  getUserBracketResults: async (bracketId: number, userId: string): Promise<Result[]> => {
    const response = await api.get(`/brackets/${bracketId}/users/${userId}/results`);
    return response.data;
  },

  // Get all results for a specific user
  getUserResults: async (userId: string): Promise<Result[]> => {
    const response = await api.get(`/users/${userId}/results`);
    return response.data;
  },

  // Get popular brackets
  getPopularBrackets: async (): Promise<Bracket[]> => {
    const response = await api.get('/brackets/popular');
    return response.data;
  },

  // Create new bracket
  createBracket: async (name: string, description: string, type: string): Promise<Bracket> => {
    const response = await api.post('/brackets', {
      name,
      description,
      type,
    });
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
    return response.data;
  },
};

export default api;
