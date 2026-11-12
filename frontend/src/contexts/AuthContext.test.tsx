import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { User } from 'firebase/auth';
import { AuthProvider, isInAppBrowser, useAuth } from './AuthContext';
import { authDomain, loadAuth, SESSION_HINT_KEY } from '../config/firebase';

vi.mock('../config/firebase', async (importOriginal) => ({
  ...await importOriginal<typeof import('../config/firebase')>(),
  loadAuth: vi.fn(),
}));
vi.mock('@/services/api', () => ({ resetApiAuthState: vi.fn() }));

const user = { uid: 'u1', email: 'a@b.c', displayName: 'Ann', photoURL: null } as User;

// A stand-in for Firebase: the listener reports `initialUser` once subscribed.
function fakeFirebase(initialUser: User | null, signInError?: unknown) {
  const firebase = {
    auth: {},
    googleProvider: {},
    onAuthStateChanged: vi.fn((_auth: unknown, listener: (u: User | null) => void) => {
      queueMicrotask(() => listener(initialUser));
      return () => {};
    }),
    signInWithPopup: vi.fn(() => (signInError ? Promise.reject(signInError) : Promise.resolve())),
    signInWithRedirect: vi.fn(() => Promise.resolve()),
    getRedirectResult: vi.fn(() => Promise.resolve(null)),
    signOut: vi.fn(() => Promise.resolve()),
  };
  vi.mocked(loadAuth).mockResolvedValue(firebase as unknown as Awaited<ReturnType<typeof loadAuth>>);
  return firebase;
}

let auth: ReturnType<typeof useAuth>;
const Probe = () => {
  auth = useAuth();
  return <p>{auth.currentUser?.displayName ?? 'guest'}{auth.currentUser?.isAdmin ? ' (admin)' : ''}</p>;
};
const renderApp = () => render(<AuthProvider><Probe /></AuthProvider>);

describe('AuthContext', () => {
  beforeEach(() => vi.mocked(loadAuth).mockReset());
  afterEach(() => window.localStorage.clear());

  it('renders guests without downloading Firebase', async () => {
    renderApp();
    expect(await screen.findByText('guest')).toBeInTheDocument();
    expect(loadAuth).not.toHaveBeenCalled();
  });

  it('restores a stored session before rendering the app', async () => {
    window.localStorage.setItem(SESSION_HINT_KEY, '1');
    fakeFirebase(user);
    renderApp();
    expect(screen.queryByText('guest')).not.toBeInTheDocument();
    expect(await screen.findByText('Ann')).toBeInTheDocument();
  });

  it('marks users whose token carries the admin claim', async () => {
    window.localStorage.setItem(SESSION_HINT_KEY, '1');
    fakeFirebase({ ...user, getIdTokenResult: async () => ({ claims: { admin: true } }) } as unknown as User);
    renderApp();
    expect(await screen.findByText('Ann (admin)')).toBeInTheDocument();
  });

  it('remembers that a stored session has ended', async () => {
    window.localStorage.setItem(SESSION_HINT_KEY, '1');
    fakeFirebase(null);
    renderApp();
    expect(await screen.findByText('guest')).toBeInTheDocument();
    expect(window.localStorage.getItem(SESSION_HINT_KEY)).toBe('0');
  });

  it('loads Firebase on sign-in and ignores a closed popup', async () => {
    const firebase = fakeFirebase(null, { code: 'auth/popup-closed-by-user' });
    renderApp();
    await screen.findByText('guest');
    await act(() => auth.signInWithGoogle());
    expect(firebase.signInWithPopup).toHaveBeenCalled();
    expect(firebase.onAuthStateChanged).toHaveBeenCalled();
  });

  it('reports other sign-in errors', async () => {
    fakeFirebase(null, { code: 'auth/network-request-failed' });
    renderApp();
    await screen.findByText('guest');
    await expect(auth.signInWithGoogle()).rejects.toEqual({ code: 'auth/network-request-failed' });
  });

  it('signs in by redirect when the popup is blocked, and finishes after coming back', async () => {
    const firebase = fakeFirebase(null, { code: 'auth/popup-blocked' });
    let hintWhenLeaving: string | null = null;
    firebase.signInWithRedirect.mockImplementation(() => {
      hintWhenLeaving = window.localStorage.getItem(SESSION_HINT_KEY);
      return Promise.resolve();
    });
    renderApp();
    await screen.findByText('guest');
    await act(() => auth.signInWithGoogle());
    expect(firebase.signInWithRedirect).toHaveBeenCalledWith(firebase.auth, firebase.googleProvider);
    // The page reloads after the redirect; the hint makes it load Firebase to finish.
    expect(hintWhenLeaving).toBe('1');
    expect(firebase.getRedirectResult).toHaveBeenCalled();
  });

  it('goes straight to the redirect in apps whose browsers have no popups', async () => {
    const agent = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0');
    try {
      const firebase = fakeFirebase(null);
      renderApp();
      await screen.findByText('guest');
      await act(() => auth.signInWithGoogle());
      expect(firebase.signInWithPopup).not.toHaveBeenCalled();
      expect(firebase.signInWithRedirect).toHaveBeenCalled();
    } finally {
      agent.mockRestore();
    }
  });
});

describe('isInAppBrowser', () => {
  it.each([
    ['Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]', true],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A; wv) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36', true],
    ['Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36 musical_ly_2023', true],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36', false],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', false],
  ])('%s -> %s', (agent, expected) => {
    expect(isInAppBrowser(agent)).toBe(expected);
  });
});

describe('authDomain', () => {
  afterEach(() => document.head.querySelectorAll('meta[name="auth-domain"]').forEach(m => m.remove()));

  it('prefers the domain the served page names', () => {
    const meta = document.createElement('meta');
    meta.name = 'auth-domain';
    meta.content = 'duely.example';
    document.head.appendChild(meta);
    expect(authDomain()).toBe('duely.example');
    meta.content = '';
    expect(authDomain()).toBe(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN);
  });
});
