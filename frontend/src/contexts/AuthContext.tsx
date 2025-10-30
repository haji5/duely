import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { auth, googleProvider } from '../config/firebase';
import { resetApiAuthState } from '@/services/api';

interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

interface AuthContextType {
  currentUser: UserProfile | null;
  user: UserProfile | null; // Add user property for compatibility
  loading: boolean;
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

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Track previous user to detect user switches
  const prevUserRef = React.useRef<UserProfile | null>(null);

  const signInWithGoogle = async (): Promise<void> => {
    try {
      const result = await signInWithPopup(auth, googleProvider);

      if (result.user) {
        const userProfile: UserProfile = {
          uid: result.user.uid,
          email: result.user.email,
          displayName: result.user.displayName,
          photoURL: result.user.photoURL
        };
        setCurrentUser(userProfile);
        // Store user data in localStorage for persistence
        localStorage.setItem('user', JSON.stringify(userProfile));
      }
    } catch (error) {
      console.error('Error signing in with Google:', error);
      throw error;
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await signOut(auth);
      setCurrentUser(null);
      localStorage.removeItem('user');
      // Clear any cached API auth/CSRF state on logout
      resetApiAuthState();
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  useEffect(() => {
    // Check if user is stored in localStorage on app start
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        setCurrentUser(userData);
      } catch (error) {
        console.error('Error parsing stored user data:', error);
        localStorage.removeItem('user');
      }
    }

    // Listen for authentication state changes
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const prevUser = prevUserRef.current;

      if (user) {
        const userProfile: UserProfile = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL
        };

        // SECURITY: Clear cache if user switches accounts
        // This prevents User A's cached data from being shown to User B
        if (prevUser && prevUser.uid !== user.uid) {
          console.log('[Auth] User switched from', prevUser.uid, 'to', user.uid, '- clearing cache');
          resetApiAuthState();
        }

        setCurrentUser(userProfile);
        localStorage.setItem('user', JSON.stringify(userProfile));
        prevUserRef.current = userProfile;
      } else {
        setCurrentUser(null);
        localStorage.removeItem('user');
        // Also reset API state if the user signs out elsewhere
        resetApiAuthState();
        prevUserRef.current = null;
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const value: AuthContextType = {
    currentUser,
    user: currentUser, // Provide both properties for compatibility
    loading,
    signInWithGoogle,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
