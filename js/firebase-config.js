// ================================================================
// FIREBASE CONFIG — Sedekah Digital
// Ganti nilai di bawah dengan config Firebase project kamu!
// ================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// TODO: Ganti dengan Firebase config kamu dari Firebase Console
const firebaseConfig = {
  apiKey: "AIzaSyD8OHaQW3Ubxe9ZPysvtLgLfB_x98jp_8U",
  authDomain: "sedekah-digital.firebaseapp.com",
  projectId: "sedekah-digital",
  storageBucket: "sedekah-digital.firebasestorage.app",
  messagingSenderId: "1062237439307",
  appId: "1:1062237439307:web"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export default app;
