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

  leaderboardSection.innerHTML = "<p>Loading leaderboard...</p>";

  try {
    const usersRef = collection(db, "users");
    const snapshot = await getDocs(usersRef);

    const users = [];

    // 🔁 Loop through all user documents
    for (const userDoc of snapshot.docs) {
      const userId = userDoc.id;
      let username = "Unknown";
      let xp = 0;

      try {
        // Fetch nested profile document
        const profileRef = doc(db, "users", userId, "data", "profile");
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
          username =
            profileSnap.data().username ||
            userDoc.data().displayName ||
            userDoc.data().email ||
            "Unknown";
        }

        // Fetch stats document for XP
        const statsRef = doc(db, "users", userId, "data", "stats");
        const statsSnap = await getDoc(statsRef);
        if (statsSnap.exists()) {
          xp = Number(statsSnap.data().xp) || 0;
        }
      } catch (e) {
        console.warn(`⚠️ Could not fetch data for ${userId}:`, e);
      }

      users.push({
        id: userId,
        name: username,
        xp,
      });
    }

    // Ensure current user always appears even if missing
    if (!users.some((u) => u.id === user.uid)) {
      const yourProfileRef = doc(db, "users", user.uid, "data", "profile");
      const yourProfileSnap = await getDoc(yourProfileRef);
      const yourStatsRef = doc(db, "users", user.uid, "data", "stats");
      const yourStatsSnap = await getDoc(yourStatsRef);

      const yourName =
        (yourProfileSnap.exists() && yourProfileSnap.data().username) ||
        user.displayName ||
        user.email;

      const yourXp =
        yourStatsSnap.exists() ? Number(yourStatsSnap.data().xp) || 0 : 0;

      users.push({
        id: user.uid,
        name: yourName,
        xp: yourXp,
      });
    }

    // Sort by XP (highest first)
    users.sort((a, b) => b.xp - a.xp);

    // 🎨 Build leaderboard UI
    leaderboardSection.innerHTML = "";
    users.forEach((u, i) => {
      const div = document.createElement("div");
      div.classList.add("user-entry");

      if (i === 0) div.classList.add("top1");
      else if (i === 1) div.classList.add("top2");
      else if (i === 2) div.classList.add("top3");
      if (u.id === user.uid) div.classList.add("current-user");

      const medal =
        i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;

      div.innerHTML = `
        <span>${medal} ${u.name}</span>
        <span>${u.xp} XP</span>
      `;
      leaderboardSection.appendChild(div);
    });

  } catch (err) {
    console.error("❌ Error loading leaderboard:", err);
    leaderboardSection.innerHTML = "<p>❌ Failed to load leaderboard.</p>";
  }
});
