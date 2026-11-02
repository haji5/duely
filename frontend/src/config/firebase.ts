import type { Auth, User } from 'firebase/auth';
import { local } from '@/utils/storage';

// Firebase web config. These values are public identifiers (they ship in the bundle);
// access is controlled by Firebase Auth's authorized domains, not by keeping them secret.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/** '1' after Firebase reported a signed-in user, '0' after it reported none. */
export const SESSION_HINT_KEY = 'authSession';

type AuthModule = typeof import('firebase/auth');

export type LoadedAuth = Pick<AuthModule, 'onAuthStateChanged' | 'signInWithPopup' | 'signOut'> & {
  auth: Auth;
  googleProvider: InstanceType<AuthModule['GoogleAuthProvider']>;
};

let loading: Promise<LoadedAuth> | null = null;
let loadedAuth: Auth | null = null;

/**
 * Downloads and initialises Firebase Auth on first call; later calls share it. Guests never
 * call this until they sign in, so the Firebase chunk stays off their critical path.
 */
export function loadAuth(): Promise<LoadedAuth> {
  loading ??= Promise.all([import('firebase/app'), import('firebase/auth')])
    .then(([{ initializeApp }, firebaseAuth]) => {
      const auth = firebaseAuth.getAuth(initializeApp(firebaseConfig));
      const googleProvider = new firebaseAuth.GoogleAuthProvider();
      googleProvider.setCustomParameters({ prompt: 'select_account' });
      loadedAuth = auth;
      return {
        auth,
        googleProvider,
        onAuthStateChanged: firebaseAuth.onAuthStateChanged,
        signInWithPopup: firebaseAuth.signInWithPopup,
        signOut: firebaseAuth.signOut,
      };
    })
    .catch((error: unknown) => {
      // Let a later call retry, e.g. after a network blip.
      loading = null;
      throw error;
    });
  return loading;
}

/** The signed-in Firebase user, or null while Firebase Auth isn't loaded (a guest). */
export function currentFirebaseUser(): User | null {
  return loadedAuth?.currentUser ?? null;
}

/** Whether a stored session may exist, so Firebase Auth has to be loaded to restore it. */
export async function mayHaveStoredSession(): Promise<boolean> {
  const hint = local.get(SESSION_HINT_KEY);
  if (hint !== null) return hint === '1';
  // No hint yet (first visit since hints were added): Firebase keeps sessions in this database.
  try {
    if (!indexedDB.databases) return true;
    const databases = await indexedDB.databases();
    return databases.some((db) => db.name === 'firebaseLocalStorageDb');
  } catch {
    return false;
  }
}
