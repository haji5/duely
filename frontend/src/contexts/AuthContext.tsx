import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { loadAuth, mayHaveStoredSession, SESSION_HINT_KEY } from '../config/firebase';
import { resetApiAuthState } from '@/services/api';
import { local } from '@/utils/storage';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

interface AuthContextType {
  currentUser: UserProfile | null;
  /** Opens the Google sign-in popup. Resolves quietly if the user closes it. */
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

const CANCELLED_POPUP_CODES = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request']);

const isCancelledPopup = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && CANCELLED_POPUP_CODES.has(String(error.code));

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  // Known guests render at once; anyone who may have a stored session waits for Firebase.
  const [loading, setLoading] = useState(() => local.get(SESSION_HINT_KEY) !== '0');
  // Firebase Auth is only downloaded once it's needed: a stored session or a sign-in.
  const [authNeeded, setAuthNeeded] = useState(false);
  const uidRef = useRef<string | null>(null);

  useEffect(() => {
    // Older versions mirrored the profile here; Firebase persists the session itself.
    local.remove('user');

    let cancelled = false;
    void mayHaveStoredSession().then((mayHave) => {
      if (cancelled) return;
      if (mayHave) setAuthNeeded(true);
      else setLoading(false);
    });

    // Signing in from another tab: follow it here too.
    const onStorage = (event: StorageEvent) => {
      if (event.key === SESSION_HINT_KEY && event.newValue === '1') setAuthNeeded(true);
    };
    window.addEventListener('storage', onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    if (!authNeeded) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    loadAuth().then(({ auth, onAuthStateChanged }) => {
      if (cancelled) return;
      // Firebase's listener is the single source of truth for the signed-in user.
      unsubscribe = onAuthStateChanged(auth, (user) => {
        const uid = user?.uid ?? null;
        if (uid !== uidRef.current) {
          // Never let one user's cached responses reach the next.
          resetApiAuthState();
          uidRef.current = uid;
        }
        local.set(SESSION_HINT_KEY, user ? '1' : '0');
        setCurrentUser(user ? {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
        } : null);
        setLoading(false);
      });
    }).catch((error: unknown) => {
      // Firebase couldn't be downloaded: carry on as a guest; signing in retries the download.
      console.error('Failed to load sign-in:', error);
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [authNeeded]);

  const signInWithGoogle = async (): Promise<void> => {
    setAuthNeeded(true);
    const { auth, googleProvider, signInWithPopup } = await loadAuth();
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      if (isCancelledPopup(error)) return;
      throw error;
    }
  };

  const logout = async (): Promise<void> => {
    const { auth, signOut } = await loadAuth();
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ currentUser, signInWithGoogle, logout }}>
      {/* Children wait for the first auth state so pages never see a "signed out" flash */}
      {!loading && children}
    </AuthContext.Provider>
  );
};
