import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

const firebaseConfig = {
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || "ai-studio-49448c2c-5e60-4efd-9138-c1dbfa86a245",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

/* The app works fully offline (localStorage) when no Firebase
   config is present — auth and sync switch on once configured. */
export const firebaseEnabled = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let app: FirebaseApp | null = null;
let firestore: Firestore | null = null;
let firebaseAuth: Auth | null = null;

if (firebaseEnabled) {
  try {
    app = initializeApp(firebaseConfig);
    firestore = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    firebaseAuth = getAuth(app);
  } catch (e) {
    console.error('Firebase failed to initialize — running offline.', e);
  }
}

export { app, firebaseAuth as auth, firestore as db };

export const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = () => {
  if (!firebaseAuth) return Promise.reject(new Error('Firebase is not configured'));
  return signInWithPopup(firebaseAuth, googleProvider);
};
export const logOut = () => (firebaseAuth ? signOut(firebaseAuth) : Promise.resolve());

/* Turns an auth failure into honest copy. Returns null for things that
   aren't errors — the user closing or cancelling the popup. */
export const describeAuthError = (e: unknown): string | null => {
  const code = (e as { code?: string })?.code || '';
  const domain = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request' || code === 'auth/user-cancelled') return null;
  if (code === 'auth/unauthorized-domain')
    return `${domain} isn't authorized for sign-in — add it in Firebase Console → Authentication → Settings → Authorized domains.`;
  if (code === 'auth/popup-blocked')
    return 'The sign-in popup was blocked — allow popups for this site and try again.';
  if (code === 'auth/operation-not-allowed')
    return 'Google sign-in is switched off for this Firebase project — enable it in Firebase Console → Authentication → Sign-in method.';
  if (code === 'auth/network-request-failed')
    return "Couldn't reach the sign-in service — check the connection and try again.";
  const msg = (e as { message?: string })?.message;
  return `Sign-in failed${msg ? ` — ${msg}` : ' — try again.'}`;
};
