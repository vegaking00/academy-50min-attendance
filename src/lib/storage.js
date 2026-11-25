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

let activeMode = isFirebaseConfigured ? 'firebase' : 'local';

export function createInitialState() {
  return {
    students: generateSampleStudents(200),
    activeSessions: [],
    history: [],
    updatedAt: Date.now(),
  };
}

export function subscribeState(onData, onError, onModeChange) {
  let cancelled = false;
  let eventSource = null;
  let unsubFirestore = null;

  async function init() {
    // 1. Check if academy local Wi-Fi server is running on the same origin
    try {
      const healthRes = await fetch('/api/health', { cache: 'no-store' });
      if (healthRes.ok) {
        const health = await healthRes.json();
        if (health?.ok && !cancelled) {
          activeMode = 'wifi-server';
          onModeChange?.('wifi-server');

          const stateRes = await fetch('/api/state', { cache: 'no-store' });
          const stateJson = await stateRes.json();
          if (stateJson.exists && stateJson.state) {
            onData(stateJson.state);
          } else {
            const initData = createInitialState();
            await fetch('/api/state', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(initData),
            });
            onData(initData);
          }

          eventSource = new EventSource('/api/events');
          eventSource.onmessage = (evt) => {
            try {
              const next = JSON.parse(evt.data);
              onData(next);
            } catch {
              // ignore malformed SSE chunk
            }
          };
          eventSource.onerror = () => {
            onError?.(new Error('메인 컴퓨터 서버와 연결이 끊어졌습니다.'));
          };
          return;
        }
      }
    } catch {
      // Not running on local Wi-Fi server; fall through to Firebase or localStorage
    }

    if (cancelled) return;

    // 2. Firebase mode
    if (isFirebaseConfigured && db) {
      activeMode = 'firebase';
      onModeChange?.('firebase');
      const ref = doc(db, ...DOC_PATH);
      unsubFirestore = onSnapshot(
        ref,
        (snap) => {
          if (snap.exists()) {
            onData(snap.data());
          } else {
            const initData = createInitialState();
            setDoc(ref, initData).catch((err) => onError?.(err));
            onData(initData);
          }
        },
        (err) => onError?.(err)
      );
      return;
    }

    // 3. LocalStorage fallback
    activeMode = 'local';
    onModeChange?.('local');
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      const parsed = raw ? JSON.parse(raw) : createInitialState();
      if (!raw) localStorage.setItem(LOCAL_KEY, JSON.stringify(parsed));
      onData(parsed);
    } catch {
      onData(createInitialState());
    }
  }

  init();

  return () => {
    cancelled = true;
    if (eventSource) eventSource.close();
    if (unsubFirestore) unsubFirestore();
  };
}

export async function saveState(nextState) {
  const payload = { ...nextState, updatedAt: Date.now() };

  if (activeMode === 'wifi-server') {
    const res = await fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error('메인 컴퓨터 저장 실패');
    }
    return;
  }

  if (activeMode === 'firebase' && db) {
    const ref = doc(db, ...DOC_PATH);
    await setDoc(ref, payload);
    return;
  }

  localStorage.setItem(LOCAL_KEY, JSON.stringify(payload));
}
