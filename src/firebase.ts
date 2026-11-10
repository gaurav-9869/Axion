import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  deleteDoc,
  getDocFromServer,
  serverTimestamp
} from "firebase/firestore";
import firebaseConfigJson from '../firebase-applet-config.json';

const firebaseConfig = {
  apiKey: firebaseConfigJson.apiKey,
  authDomain: firebaseConfigJson.authDomain,
  projectId: firebaseConfigJson.projectId,
  storageBucket: firebaseConfigJson.storageBucket,
  messagingSenderId: firebaseConfigJson.messagingSenderId,
  appId: firebaseConfigJson.appId,
  measurementId: firebaseConfigJson.measurementId || undefined
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Explicitly set browser-local persistence
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn("Firebase Auth setPersistence failed:", err);
});

// Connect to the (default) Firestore database in Mumbai (asia-south1)
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Check Firebase configuration: client is offline.");
    }
  }
}
testConnection().catch((err) => console.warn("Firebase test connection catch:", err));

// Unified Google OAuth + Firebase Auth Handshake
export const syncGoogleAuthWithFirebase = async (googleIdToken: string | null, googleAccessToken?: string | null) => {
  try {
    const credential = GoogleAuthProvider.credential(googleIdToken || null, googleAccessToken || undefined);
    const userCredential = await signInWithCredential(auth, credential);
    console.log("Firebase Auth Successfully Synced User:", userCredential.user.uid);
    return userCredential.user;
  } catch (error) {
    console.error("Firebase Auth Handshake Failed:", error);
    throw error;
  }
};

export {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  onAuthStateChanged,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  deleteDoc,
  getDocFromServer,
  serverTimestamp
};
