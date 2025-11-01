import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

// 🚀 Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// 🎉 Show animated popup
function showAchievementPopup(text) {
  const popup = document.createElement("div");
  popup.className =
    "achievement-popup fixed bottom-5 right-5 bg-green-600 text-white text-lg px-5 py-3 rounded-xl shadow-lg animate-fade";
  popup.textContent = `🏆 ${text}`;
  document.body.appendChild(popup);

  // Fade out after 4s
  setTimeout(() => popup.remove(), 4000);
}

// 🏆 Load + update achievements
async function loadAchievements(user) {
  const statsRef = doc(db, "users", user.uid, "data", "stats");
  const achRef = doc(db, "users", user.uid, "data", "achievements");

  const [statsSnap, achSnap] = await Promise.all([getDoc(statsRef), getDoc(achRef)]);
  const stats = statsSnap.data() || {};
  const achievementsData = achSnap.exists() ? achSnap.data() : { unlocked: [] };

  const unlocked = new Set(achievementsData.unlocked);
  const newAchievements = [];

  // 🎯 Unlock conditions
  const unlockIf = (condition, name) => {
    if (condition && !unlocked.has(name)) {
      newAchievements.push(name);
      unlocked.add(name);
    }
  };

  unlockIf(stats.streak >= 3, "🔥 3-Day Streak");
  unlockIf(stats.streak >= 7, "💪 7-Day Warrior");
  unlockIf(stats.streak >= 30, "👑 30-Day Legend");
  unlockIf(stats.xp >= 100, "⚡ 100 XP Club");
  unlockIf(stats.xp >= 500, "💎 Platinum Grinder");
  unlockIf(stats.xp >= 1000, "🏆 Fitness Master");

  // 💾 Save if new achievements found
  if (newAchievements.length > 0) {
    await setDoc(
      achRef,
      {
        unlocked: Array.from(unlocked),
        lastUpdated: new Date().toISOString(),
      },
      { merge: true }
    );

    // 🔔 Show popup for each new achievement
    newAchievements.forEach((a) => showAchievementPopup(a));
  }

  // 🧾 Show in list
  const list = document.getElementById("achievements-list");
  if (unlocked.size === 0) {
    list.innerHTML = "<li>No achievements yet. Keep training!</li>";
  } else {
    list.innerHTML = Array.from(unlocked)
      .map((a) => `<li>${a}</li>`)
      .join("");
  }
}

// 🔐 Auth listener
onAuthStateChanged(auth, (user) => {
  if (user) loadAchievements(user);
  else window.location.href = "login.html";
});
