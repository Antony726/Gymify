import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

// 🚀 Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const leaderboardSection = document.getElementById("leaderboard");

onAuthStateChanged(auth, async (user) => {

  if (!user) {
    leaderboardSection.innerHTML = "<p>Please login first.</p>";
    return;
  }

  const usersRef = collection(db, "users");
  const userDocs = await getDocs(usersRef);

  let users = [];

  for (const userDoc of userDocs.docs) {
    const userId = userDoc.id;
    const statsRef = doc(db, "users", userId, "data", "stats");
    const statsSnap = await getDoc(statsRef);

    console.log("Stats for user:", userId, statsSnap.exists() ? statsSnap.data() : "No data");

    let xp = 0;
    if (statsSnap.exists()) {
      // Convert string XP to number if necessary
      xp = Number(statsSnap.data().xp) || 0;
    }

    users.push({
      id: userId,
      name: userDoc.data().name || "Unknown User",
      xp,
    });
  }

  // Ensure your own profile appears even if others are missing
  if (!users.some((u) => u.id === user.uid)) {
    const yourStatsRef = doc(db, "users", user.uid, "data", "stats");
    const yourStatsSnap = await getDoc(yourStatsRef);
    const yourXp = yourStatsSnap.exists() ? Number(yourStatsSnap.data().xp) || 0 : 0;

    users.push({
      id: user.uid,
      name: user.displayName || user.email,
      xp: yourXp,
    });
  }

  // Sort users by XP descending
  users.sort((a, b) => b.xp - a.xp);

  // 🧱 Build leaderboard UI
  leaderboardSection.innerHTML = "";
  users.forEach((u, i) => {
    const div = document.createElement("div");
    div.classList.add("user-entry");
    if (i === 0) div.classList.add("top1");
    else if (i === 1) div.classList.add("top2");
    else if (i === 2) div.classList.add("top3");
    if (u.id === user.uid) div.classList.add("current-user");

    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
    div.innerHTML = `
      <span>${medal} ${u.name}</span>
      <span>${u.xp} XP</span>
    `;
    leaderboardSection.appendChild(div);
  });
});
