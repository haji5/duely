import { auth } from '@/config/firebase';

const CSRF_TOKEN_KEY = 'csrf_token';
const CSRF_TOKEN_EXPIRY_KEY = 'csrf_token_expiry';

/**
 * Service for managing CSRF tokens.
 * Fetches tokens from the backend and stores them for use in requests.
 */
class CsrfService {
  private token: string | null = null;
  private expiryTime: number = 0;

  /**
   * Get the current CSRF token, fetching a new one if needed.
   * Returns null if user is not authenticated.
   */
  async getToken(): Promise<string | null> {
    const user = auth.currentUser;

    if (!user) {
      return null;
    }

    // Check if we have a valid cached token
    if (this.token && Date.now() < this.expiryTime) {
      return this.token;
    }

    // Fetch new token from backend
    try {
      const idToken = await user.getIdToken();
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8080/api'}/csrf-token`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies
      });

      if (!response.ok) {
        console.error('[CSRF Service] Failed to fetch CSRF token:', response.status);
        return null;
      }

      const data = await response.json();
      this.token = data.token;

      // Set expiry time (token expires in 1 hour)
      this.expiryTime = Date.now() + (parseInt(data.expiresIn) * 1000);

      // Store in sessionStorage as backup
      if (this.token) {
        sessionStorage.setItem(CSRF_TOKEN_KEY, this.token);
        sessionStorage.setItem(CSRF_TOKEN_EXPIRY_KEY, this.expiryTime.toString());
      }

      return this.token;
    } catch (error) {
      console.error('[CSRF Service] Error fetching CSRF token:', error);
      return null;
    }
  }

  /**
   * Clear the stored CSRF token (e.g., on logout).
   */
  clearToken(): void {
    this.token = null;
    this.expiryTime = 0;
    sessionStorage.removeItem(CSRF_TOKEN_KEY);
    sessionStorage.removeItem(CSRF_TOKEN_EXPIRY_KEY);
  }

  /**
   * Invalidate CSRF token on the server (e.g., on logout).
   */
  async invalidateToken(): Promise<void> {
    const user = auth.currentUser;

    if (!user) {
      this.clearToken();
      return;
    }

    try {
      const idToken = await user.getIdToken();
      const token = await this.getToken();

      await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8080/api'}/csrf-token/invalidate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json',
          'X-CSRF-Token': token || '',
        },
        credentials: 'include',
      });
    } catch (error) {
      console.error('[CSRF Service] Error invalidating CSRF token:', error);
    } finally {
      this.clearToken();
    }
  }
}

export const csrfService = new CsrfService();

