import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyCljc76Ilvb1NpDXtD3WxXmGMIBjleCCdg',
  authDomain: 'email-warmup-d918e.firebaseapp.com',
  projectId: 'email-warmup-d918e',
  storageBucket: 'email-warmup-d918e.firebasestorage.app',
  messagingSenderId: '1082337714849',
  appId: '1:1082337714849:web:a7cbb55a3efc38f3ec46e0',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
// Always show the account chooser, even if the user is already signed in
// to a single Google account in this browser. Without this, Firebase will
// silently pick the only signed-in account and the popup looks broken.
googleProvider.setCustomParameters({ prompt: 'select_account' });
// Standard scopes for email + basic profile (verified email used by /auth/firebase).
googleProvider.addScope('email');
googleProvider.addScope('profile');
