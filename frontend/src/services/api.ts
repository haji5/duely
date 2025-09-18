import axios from 'axios';
import { Bracket, Item, Result } from '../types';

const API_BASE_URL = 'http://localhost:8080/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
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

  // Save bracket result
  saveBracketResult: async (id: number, userId: string | null, ranking: number[]): Promise<Result> => {
    const response = await api.post(`/brackets/${id}/results`, {
      userId,
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

  // Create bracket with items
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

  // Get all bracket results from all users
  getAllBracketResults: async (bracketId: number): Promise<Result[]> => {
    const response = await api.get(`/brackets/${bracketId}/results/all`);
    return response.data;
  },
};

export default api;
