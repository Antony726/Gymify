// js/redirectIfLoggedIn.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

onAuthStateChanged(auth, (user) => {
  if (user) {
    // Already signed in → skip login/signup/index
    if (window.location.pathname.includes("index") || 
        window.location.pathname.includes("login") || 
        window.location.pathname.includes("signup")) {
      window.location.href = "dashboard.html";
    }
  }
});
