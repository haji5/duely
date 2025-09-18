import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

// Your web app's Firebase configuration
// Replace these with your actual Firebase config values
const firebaseConfig = {
    apiKey: "AIzaSyAX9U54jU4iBQxVlSA67xtSMlzYrkxO0EQ",
    authDomain: "duelybattles.firebaseapp.com",
    projectId: "duelybattles",
    storageBucket: "duelybattles.firebasestorage.app",
    messagingSenderId: "303255979287",
    appId: "1:303255979287:web:9c08dfbaad615865c6e352",
    measurementId: "G-8RCDW6HJPK"
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

// Initialize Google Auth Provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export default app;
