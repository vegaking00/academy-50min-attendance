import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot,
} from 'firebase/firestore';
import { generateSampleStudents } from '../data/sampleStudents';

const LOCAL_KEY = 'leaders_art_attendance_v1';
const DOC_PATH = ['academies', 'leaders-art-state'];

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId
);

let db = null;
if (isFirebaseConfigured) {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  db = getFirestore(app);
}

export function createInitialState() {
  return {
    students: generateSampleStudents(200),
    activeSessions: [],
    history: [],
    updatedAt: Date.now(),
  };
}

export function subscribeState(onData, onError) {
  if (!isFirebaseConfigured || !db) {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      const parsed = raw ? JSON.parse(raw) : createInitialState();
      if (!raw) localStorage.setItem(LOCAL_KEY, JSON.stringify(parsed));
      onData(parsed);
    } catch (e) {
      onData(createInitialState());
    }
    return () => {};
  }

  const ref = doc(db, ...DOC_PATH);
  return onSnapshot(
    ref,
    (snap) => {
      if (snap.exists()) {
        onData(snap.data());
      } else {
        const init = createInitialState();
        setDoc(ref, init).catch((err) => onError?.(err));
        onData(init);
      }
    },
    (err) => {
      onError?.(err);
    }
  );
}

export async function saveState(nextState) {
  const payload = { ...nextState, updatedAt: Date.now() };
  if (!isFirebaseConfigured || !db) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(payload));
    return;
  }
  const ref = doc(db, ...DOC_PATH);
  await setDoc(ref, payload);
}
