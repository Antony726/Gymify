import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import {
  getFirestore, doc, getDoc, getDocs, collection, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";
import { toLocalDateStr } from "./streak-utils.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const gymInfo = document.getElementById("gymInfo");
const gymMembersDiv = document.getElementById("gymMembers");
const checkinBtn = document.getElementById("checkinBtn");
const checkinStatus = document.getElementById("checkinStatus");
const checkinCard = document.getElementById("checkinCard");

let currentUser = null;
let gymName = "";
let gymArea = "";

function isCheckinActive(checkin) {
  if (!checkin?.active || checkin.date !== toLocalDateStr()) return false;
  const checkedAt = new Date(checkin.checkedInAt).getTime();
  return Date.now() - checkedAt < 4 * 60 * 60 * 1000;
}

async function loadMyCheckin(userId) {
  const checkinRef = doc(db, "users", userId, "data", "checkin");
  const snap = await getDoc(checkinRef);
  const checkin = snap.exists() ? snap.data() : null;
  const active = isCheckinActive(checkin);

  if (active) {
    checkinCard.classList.add("active");
    checkinBtn.textContent = "🚪 Check Out";
    checkinBtn.classList.add("btn-secondary");
    checkinStatus.textContent = "You're checked in — gymmates can see you're training!";
  } else {
    checkinCard.classList.remove("active");
    checkinBtn.textContent = "✅ I'm at the Gym";
    checkinBtn.classList.remove("btn-secondary");
    checkinStatus.textContent = "";
  }
  return active;
}

checkinBtn.addEventListener("click", async () => {
  if (!currentUser) return;
  const checkinRef = doc(db, "users", currentUser.uid, "data", "checkin");
  const snap = await getDoc(checkinRef);
  const checkin = snap.exists() ? snap.data() : null;
  const active = isCheckinActive(checkin);

  if (active) {
    await setDoc(checkinRef, { active: false, date: toLocalDateStr(), checkedOutAt: new Date().toISOString() });
    window.showToast?.("Checked out. See you next session! 💪", "info");
  } else {
    await setDoc(checkinRef, {
      active: true,
      date: toLocalDateStr(),
      checkedInAt: new Date().toISOString(),
      gymName,
      gymArea,
    });
    window.showToast?.("Checked in! Your gym buddies can see you're here 📍", "success");
  }

  await loadMyCheckin(currentUser.uid);
  await loadGymMembers(gymName, gymArea, currentUser.uid);
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  currentUser = user;

  const profileRef = doc(db, "users", user.uid, "data", "profile");
  const profileSnap = await getDoc(profileRef);

  if (!profileSnap.exists()) {
    gymInfo.textContent = "⚠️ Please complete your profile first.";
    return;
  }

  const profile = profileSnap.data();
  gymName = profile.gymName;
  gymArea = profile.gymArea;

  if (!gymName || !gymArea) {
    gymInfo.textContent = "⚠️ Please update your profile with your gym and area.";
    return;
  }

  gymInfo.textContent = `${gymName} (${gymArea})`;
  await loadMyCheckin(user.uid);
  await loadGymMembers(gymName, gymArea, user.uid);
});

async function loadGymMembers(gymName, gymArea, currentUID) {
  gymMembersDiv.innerHTML = `<p class="loading">Loading members of ${gymName}...</p>`;

  const usersRef = collection(db, "users");
  const snapshot = await getDocs(usersRef);
  const members = [];

  for (const userDoc of snapshot.docs) {
    const uid = userDoc.id;
    const profileRef = doc(db, "users", uid, "data", "profile");
    const profileSnap = await getDoc(profileRef);
    if (!profileSnap.exists()) continue;

    const data = profileSnap.data();
    if (data.gymName !== gymName || data.gymArea !== gymArea) continue;

    const statsRef = doc(db, "users", uid, "data", "stats");
    const statsSnap = await getDoc(statsRef);
    const checkinRef = doc(db, "users", uid, "data", "checkin");
    const checkinSnap = await getDoc(checkinRef);
    const checkin = checkinSnap.exists() ? checkinSnap.data() : null;

    members.push({
      uid,
      isSelf: uid === currentUID,
      username: data.username || "Unknown",
      avatar: data.avatar ? `assets/avatars/${data.avatar}` : "assets/avatars/avatar1.jpg",
      xp: statsSnap.exists() ? statsSnap.data().xp || 0 : 0,
      streak: statsSnap.exists() ? statsSnap.data().streak || 0 : 0,
      checkedIn: isCheckinActive(checkin),
    });
  }

  members.sort((a, b) => {
    if (a.checkedIn !== b.checkedIn) return b.checkedIn - a.checkedIn;
    return b.xp - a.xp;
  });

  if (members.length === 0) {
    gymMembersDiv.innerHTML = `<div class="empty"><p>No members from your gym yet 🏋️</p></div>`;
    return;
  }

  gymMembersDiv.innerHTML = members.map((m) => `
    <div class="member-card ${m.checkedIn ? "checked-in" : ""}">
      <div class="avatar-wrap">
        <img src="${m.avatar}" alt="${m.username}" class="avatar" />
        ${m.checkedIn ? '<span class="live-dot"></span>' : ""}
      </div>
      <div class="member-info">
        <div class="member-name">${m.username}${m.isSelf ? " (You)" : ""}</div>
        <div class="member-stats">⭐ ${m.xp} XP • 🔥 ${m.streak} days</div>
      </div>
      ${m.checkedIn ? '<span class="at-gym-badge">At gym now</span>' : ""}
    </div>
  `).join("");
}
