import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { loadAuth, mayHaveStoredSession, SESSION_HINT_KEY } from '../config/firebase';
import { resetApiAuthState } from '@/services/api';
import { local } from '@/utils/storage';
import { isAdminClaims } from '@/utils/reports';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  /** From the ID token's claims; only decides whether admin controls show. The server checks. */
  isAdmin: boolean;
}

interface AuthContextType {
  currentUser: UserProfile | null;
  /**
   * Opens the Google sign-in popup, or goes to Google's sign-in page and back where popups don't
   * work. Resolves quietly if the user closes the popup.
   */
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

// The popup can't open here (blocked, or a webview without windows): sign in by redirect instead.
const NO_POPUP_CODES = new Set(['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment']);

const errorCode = (error: unknown): string | null =>
  typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : null;

/**
 * Apps that open shared links in their own browser (Facebook, Instagram, TikTok, Line, Snapchat,
 * Android webviews), where popups either never open or never report back.
 */
export function isInAppBrowser(userAgent = navigator.userAgent): boolean {
  return /FBAN|FBAV|FB_IAB|Instagram|TikTok|musical_ly|BytedanceWebview|Line\/|Snapchat|; wv\)/i.test(userAgent);
}

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

    loadAuth().then(({ auth, onAuthStateChanged, getRedirectResult }) => {
      if (cancelled) return;
      // Back from a redirect sign-in: the listener below reports the user; a failure is only here.
      getRedirectResult(auth).catch((error: unknown) => console.error('Redirect sign-in failed:', error));
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
          isAdmin: false,
        } : null);
        setLoading(false);
        if (user) {
          // The claims come with the (cached) token; admins get their controls a moment later.
          Promise.resolve()
            .then(() => user.getIdTokenResult())
            .then(({ claims }) => {
              if (!cancelled && isAdminClaims(claims)) {
                setCurrentUser(u => (u && u.uid === user.uid ? { ...u, isAdmin: true } : u));
              }
            })
            .catch(() => { /* no claims, no admin controls */ });
        }
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
    const { auth, googleProvider, signInWithPopup, signInWithRedirect } = await loadAuth();
    const viaRedirect = async () => {
      // The page reloads on the way back; the hint makes it load Firebase to finish signing in.
      local.set(SESSION_HINT_KEY, '1');
      await signInWithRedirect(auth, googleProvider);
    };
    if (isInAppBrowser()) {
      await viaRedirect();
      return;
    }
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const code = errorCode(error);
      if (code !== null && CANCELLED_POPUP_CODES.has(code)) return;
      if (code !== null && NO_POPUP_CODES.has(code)) {
        await viaRedirect();
        return;
      }
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
