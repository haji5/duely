# Firebase Authentication Setup

## Prerequisites

You need to create a Firebase project and enable Google Authentication. Follow these steps:

### 1. Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project" or "Add project"
3. Follow the setup wizard

### 2. Enable Google Authentication
1. In your Firebase project, go to "Authentication" > "Sign-in method"
2. Click on "Google" provider
3. Toggle "Enable"
4. Add your project's authorized domains (localhost for development)
5. Save the configuration

### 3. Get Firebase Configuration
1. Go to Project Settings (gear icon)
2. Scroll down to "Your apps" section
3. Click "Add app" and select "Web" (</>) 
4. Register your app and copy the configuration object

### 4. Update Firebase Config
Replace the placeholder values in `src/config/firebase.ts` with your actual Firebase configuration:

```typescript
const firebaseConfig = {
  apiKey: "your-actual-api-key",
  authDomain: "your-project-id.firebaseapp.com", 
  projectId: "your-actual-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "your-actual-sender-id",
  appId: "your-actual-app-id"
};
```

## Features Implemented

✅ **Sign in with Google** - One-click authentication
✅ **User Profile Display** - Shows user's name, email, and photo
✅ **Persistent Login** - Users stay logged in across browser sessions
✅ **Logout Functionality** - Clean logout that clears all user data
✅ **Loading States** - Smooth UX with loading indicators
✅ **Responsive Design** - Works on desktop and mobile
✅ **Global State Management** - User data available throughout the app

## How to Use

### In Any Component
```typescript
import { useAuth } from '../contexts/AuthContext';

const MyComponent = () => {
  const { currentUser, signInWithGoogle, logout } = useAuth();
  
  if (currentUser) {
    return <div>Welcome, {currentUser.displayName}!</div>;
  }
  
  return <button onClick={signInWithGoogle}>Sign In</button>;
};
```

### User Data Structure
```typescript
interface UserProfile {
  uid: string;              // Unique Firebase user ID
  email: string | null;     // User's email
  displayName: string | null; // User's full name
  photoURL: string | null;  // Profile picture URL
}
```

## Testing the Authentication

1. Start your development server: `npm start`
2. Navigate to your app
3. Click "Sign in with Google" in the navbar
4. Complete the Google OAuth flow
5. You should see your profile in the navbar
6. Test logout functionality from the profile dropdown

## Security Notes

- User authentication state persists in localStorage
- Firebase handles all security aspects of OAuth
- User tokens are managed automatically by Firebase SDK
- The auth state listener ensures real-time updates

## Troubleshooting

### Common Issues:
1. **Firebase config not set**: Update `src/config/firebase.ts` with real values
2. **Domain not authorized**: Add your domain in Firebase Console > Authentication > Settings
3. **Google provider not enabled**: Enable it in Firebase Console > Authentication > Sign-in method

### Development vs Production:
- Development: Add `localhost:3000` to authorized domains
- Production: Add your actual domain to authorized domains
