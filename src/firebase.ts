import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from "firebase/auth";
import {
  getFirestore,
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
  getDocFromServer,
  enableIndexedDbPersistence
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAxVuD43MhwbOZVL5bNkg2YoC-Xl4bsG_E",
  authDomain: "axion-374c6.firebaseapp.com",
  projectId: "axion-374c6",
  storageBucket: "axion-374c6.firebasestorage.app",
  messagingSenderId: "856978421941",
  appId: "1:856978421941:web:6fcfde8649005a8293a6fc",
  measurementId: "G-0BTPXB15VR"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Explicitly set browser-local persistence
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn("Firebase Auth setPersistence failed:", err);
});

export const db = getFirestore(app);

if (typeof window !== "undefined") {
  try {
    enableIndexedDbPersistence(db).catch((err) => {
      if (err.code === "failed-precondition") {
        console.warn("Firestore offline persistence failed-precondition (multiple tabs open)");
      } else if (err.code === "unimplemented") {
        console.warn("Firestore offline persistence unimplemented in current browser");
      } else {
        console.warn("Firestore offline persistence notice:", err);
      }
    });
  } catch (err) {
    console.warn("Firestore persistence initialization error:", err);
  }
}

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
  getDocFromServer
};
