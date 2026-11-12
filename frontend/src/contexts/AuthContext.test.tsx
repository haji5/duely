import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { User } from 'firebase/auth';
import { AuthProvider, useAuth } from './AuthContext';
import { loadAuth, SESSION_HINT_KEY } from '../config/firebase';

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
});
