import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey:            'AIzaSyCTJLfOoPxn8uJAM8kBbX-0n1nAnidc04M',
  authDomain:        'recallpal-app.firebaseapp.com',
  projectId:         'recallpal-app',
  storageBucket:     'recallpal-app.firebasestorage.app',
  messagingSenderId: '1038821187349',
  appId:             '1:1038821187349:web:b0cc028eba8cf5c50b131c',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);
export default app;
