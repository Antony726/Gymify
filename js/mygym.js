import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import {
  getFirestore, doc, getDoc, getDocs, collection
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const gymInfo = document.getElementById("gymInfo");
const gymMembersDiv = document.getElementById("gymMembers");

// 🔐 Listen for auth state
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const profileRef = doc(db, "users", user.uid, "data", "profile");
  const profileSnap = await getDoc(profileRef);

  if (!profileSnap.exists()) {
    gymInfo.textContent = "⚠️ Please complete your profile first.";
    return;
  }

  const profile = profileSnap.data();
  const { gymName, gymArea } = profile;

  if (!gymName || !gymArea) {
    gymInfo.textContent = "⚠️ Please update your profile with your gym and area.";
    return;
  }

  gymInfo.textContent = `${gymName} (${gymArea})`;

  await loadGymMembers(gymName, gymArea, user.uid);
});

async function loadGymMembers(gymName, gymArea, currentUID) {
  gymMembersDiv.innerHTML = `<p class="loading">Loading members of ${gymName}...</p>`;

  const usersRef = collection(db, "users");
  const snapshot = await getDocs(usersRef);

  const members = [];
  for (const userDoc of snapshot.docs) {
    const uid = userDoc.id;
    if (uid === currentUID) continue;

    const profileRef = doc(db, "users", uid, "data", "profile");
    const profileSnap = await getDoc(profileRef);

    if (!profileSnap.exists()) continue;
    const data = profileSnap.data();

    if (data.gymName === gymName && data.gymArea === gymArea) {
      const statsRef = doc(db, "users", uid, "data", "stats");
      const statsSnap = await getDoc(statsRef);

      const xp = statsSnap.exists() ? statsSnap.data().xp || 0 : 0;
      const streak = statsSnap.exists() ? statsSnap.data().streak || 0 : 0;

      members.push({
        username: data.username || "Unknown",
        avatar: data.avatar ? `assets/avatars/${data.avatar}` : "assets/avatars/default.jpg",
        xp,
        streak
      });
    }
  }

  if (members.length === 0) {
    gymMembersDiv.innerHTML = `
      <div class="empty">
        <p>No other members from your gym found yet 🏋️</p>
        <p style="font-size:13px;">Share Gymify with your gym buddies!</p>
      </div>
    `;
    return;
  }

  members.sort((a, b) => b.xp - a.xp); // Sort by XP (Leaderboard style)

  gymMembersDiv.innerHTML = members.map(member => `
    <div class="member-card">
      <img src="${member.avatar}" alt="${member.username}" class="avatar" />
      <div class="member-info">
        <div class="member-name">${member.username}</div>
        <div class="member-stats">⭐ ${member.xp} XP • 🔥 ${member.streak} days</div>
      </div>
    </div>
  `).join("");
}
