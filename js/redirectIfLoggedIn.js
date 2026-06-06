import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

onAuthStateChanged(auth, async (user) => {
  if (user) {
    const isSignup = window.location.pathname.includes("signup");
    const isLogin = window.location.pathname.includes("login");
    const isIndex = window.location.pathname.includes("index") || window.location.pathname === "/" || window.location.pathname === "" || window.location.pathname.endsWith("/Gymify/");

    if (isSignup || isLogin || isIndex) {
      try {
        const profileRef = doc(db, "users", user.uid, "data", "profile");
        const profileSnap = await getDoc(profileRef);
        
        if (profileSnap.exists() && profileSnap.data().gymName) {
          window.location.href = "dashboard.html";
        } else {
          window.location.href = "profile.html";
        }
      } catch (err) {
        console.error("Error checking profile redirect:", err);
        window.location.href = "dashboard.html";
      }
    }
  }
});
