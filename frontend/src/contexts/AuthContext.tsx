import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { FirebaseError } from 'firebase/app';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth, googleProvider } from '../config/firebase';
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

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const uidRef = useRef<string | null>(null);

  useEffect(() => {
    // Older versions mirrored the profile here; Firebase persists the session itself.
    local.remove('user');

    // Firebase's listener is the single source of truth for the signed-in user.
    return onAuthStateChanged(auth, (user) => {
      const uid = user?.uid ?? null;
      if (uid !== uidRef.current) {
        // Never let one user's cached responses reach the next.
        resetApiAuthState();
        uidRef.current = uid;
      }
      setCurrentUser(user ? {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
      } : null);
      setLoading(false);
    });
  }, []);

  const signInWithGoogle = async (): Promise<void> => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      if (error instanceof FirebaseError && CANCELLED_POPUP_CODES.has(error.code)) return;
      throw error;
    }
  };

  const logout = async (): Promise<void> => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ currentUser, signInWithGoogle, logout }}>
      {/* Children wait for the first auth state so pages never see a "signed out" flash */}
      {!loading && children}
    </AuthContext.Provider>
  );
};
