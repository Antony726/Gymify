import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyCCWGnsr_KMxZErrWrvbFw4vIm93VfrBBo",
  authDomain: "gymify-26ebc.firebaseapp.com",
  projectId: "gymify-26ebc",
  storageBucket: "gymify-26ebc.appspot.com",
  messagingSenderId: "766516910912",
  appId: "1:766516910912:web:0ea23f1ff9868ce34e38a5",
  measurementId: "G-3DC716YKQ2"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);