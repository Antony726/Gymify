import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

// 🔹 Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// 🔹 DOM Elements
const allUsersList = document.getElementById("allUsersList");
const friendsList = document.getElementById("friendsList");
const requestsList = document.getElementById("requestsList");

let currentUser = null;
let currentUserData = null;

// 🔹 On Login
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    allUsersList.innerHTML = "<p>Please login first.</p>";
    friendsList.innerHTML = "<p>Please login first.</p>";
    if (requestsList) requestsList.innerHTML = "<p>Please login first.</p>";
    return;
  }

  currentUser = user;
  console.log("👤 Logged in user:", user.uid);

  await initializeSocialData(user.uid);
  await loadCurrentUserData(user.uid);

  // Load everything in parallel for speed
  await Promise.all([
    loadAllUsers(user.uid),
    loadFriends(user.uid),
    loadFriendRequests(user.uid),
  ]);
});

// 🔸 Ensure each user has social data
async function initializeSocialData(uid) {
  const socialRef = doc(db, "users", uid, "data", "social");
  const socialSnap = await getDoc(socialRef);

  if (!socialSnap.exists()) {
    await setDoc(socialRef, {
      friends: [],
      sentRequests: [],
      receivedRequests: [],
      updatedAt: serverTimestamp(),
    });
  }
}

// 🔸 Load current user’s social data
async function loadCurrentUserData(uid) {
  const socialRef = doc(db, "users", uid, "data", "social");
  const socialSnap = await getDoc(socialRef);
  currentUserData = socialSnap.exists()
    ? socialSnap.data()
    : { friends: [], sentRequests: [], receivedRequests: [] };
}

// 🔸 Helper: get profile + stats (safe fallback)
async function getUserProfile(uid) {
  try {
    const profileRef = doc(db, "users", uid, "data", "profile");
    const statsRef = doc(db, "users", uid, "data", "stats");
    const [profileSnap, statsSnap] = await Promise.all([
      getDoc(profileRef),
      getDoc(statsRef),
    ]);

    const profile = profileSnap.exists() ? profileSnap.data() : {};
    const stats = statsSnap.exists() ? statsSnap.data() : {};

    return {
      uid,
      username: profile.username || "User",
      email: profile.email || "",
      xp: stats.xp || 0,
      streak: stats.streak || 0,
    };
  } catch {
    return { uid, username: "User", email: "", xp: 0, streak: 0 };
  }
}

// 🔸 Load all users (FAST)
async function loadAllUsers(currentUid) {
  allUsersList.innerHTML = "<p>Loading users...</p>";

  try {
    const usersRef = collection(db, "users");
    const snapshot = await getDocs(usersRef);

    if (snapshot.empty) {
      allUsersList.innerHTML = "<p>No users found.</p>";
      return;
    }

    // Fetch all user profiles in parallel
    const userProfiles = await Promise.all(
      snapshot.docs.map((docSnap) => getUserProfile(docSnap.id))
    );

    // Exclude current user
    const filteredUsers = userProfiles.filter((u) => u.uid !== currentUid);

    allUsersList.innerHTML = "";
    for (const userData of filteredUsers) {
      const card = document.createElement("div");
      card.classList.add("friend-card");

      const info = document.createElement("div");
      info.classList.add("friend-info");
      info.innerHTML = `
        <strong>${userData.username}</strong><br>
        <small>${userData.email}</small><br>
        <span class="xp-badge">⭐ ${userData.xp} XP | 🔥 ${userData.streak} days</span>
      `;

      const btn = document.createElement("button");

      // Button state logic
      if (currentUserData.friends.includes(userData.uid)) {
        btn.textContent = "Friends ✓";
        btn.classList.add("btn-friends");
      } else if (currentUserData.sentRequests.includes(userData.uid)) {
        btn.textContent = "Requested";
        btn.classList.add("btn-requested");
      } else if (currentUserData.receivedRequests.includes(userData.uid)) {
        btn.textContent = "Accept";
        btn.classList.add("btn-accept");
        btn.addEventListener("click", async () => {
          await acceptRequest(currentUid, userData.uid);
          await reloadAll(currentUid);
        });
      } else {
        btn.textContent = "Add Friend";
        btn.classList.add("btn-add");
        btn.addEventListener("click", async () => {
          await sendFriendRequest(currentUid, userData.uid);
          await reloadAll(currentUid);
        });
      }

      card.appendChild(info);
      card.appendChild(btn);
      allUsersList.appendChild(card);
    }
  } catch (error) {
    console.error("❌ Error loading users:", error);
    allUsersList.innerHTML = "<p>❌ Error loading users.</p>";
  }
}

// 🔹 Reload helper
async function reloadAll(uid) {
  await loadCurrentUserData(uid);
  await Promise.all([
    loadAllUsers(uid),
    loadFriends(uid),
    loadFriendRequests(uid),
  ]);
}

// 🔸 Send Friend Request
async function sendFriendRequest(fromUid, toUid) {
  const fromSocialRef = doc(db, "users", fromUid, "data", "social");
  const toSocialRef = doc(db, "users", toUid, "data", "social");

  await updateDoc(fromSocialRef, {
    sentRequests: arrayUnion(toUid),
    updatedAt: serverTimestamp(),
  });

  await updateDoc(toSocialRef, {
    receivedRequests: arrayUnion(fromUid),
    updatedAt: serverTimestamp(),
  });
}

// 🔸 Accept Friend Request
async function acceptRequest(currentUid, fromUid) {
  const currentSocialRef = doc(db, "users", currentUid, "data", "social");
  const fromSocialRef = doc(db, "users", fromUid, "data", "social");

  await updateDoc(currentSocialRef, {
    receivedRequests: arrayRemove(fromUid),
    friends: arrayUnion(fromUid),
    updatedAt: serverTimestamp(),
  });

  await updateDoc(fromSocialRef, {
    sentRequests: arrayRemove(currentUid),
    friends: arrayUnion(currentUid),
    updatedAt: serverTimestamp(),
  });
}

// 🔸 Load Friends
async function loadFriends(uid) {
  friendsList.innerHTML = "<p>Loading friends...</p>";

  const socialRef = doc(db, "users", uid, "data", "social");
  const socialSnap = await getDoc(socialRef);

  if (!socialSnap.exists() || !socialSnap.data().friends?.length) {
    friendsList.innerHTML = "<p>No friends yet.</p>";
    return;
  }

  const friends = socialSnap.data().friends;
  const friendProfiles = await Promise.all(friends.map((id) => getUserProfile(id)));

  friendsList.innerHTML = "";
  for (const friend of friendProfiles) {
    const div = document.createElement("div");
    div.classList.add("friend-card");
    div.innerHTML = `
      <strong>${friend.username}</strong><br>
      <span class="xp-badge">⭐ ${friend.xp} XP | 🔥 ${friend.streak} days</span>
    `;
    friendsList.appendChild(div);
  }
}

// 🔸 Load Friend Requests
async function loadFriendRequests(uid) {
  if (!requestsList) return;

  requestsList.innerHTML = "<p>Loading requests...</p>";

  const socialRef = doc(db, "users", uid, "data", "social");
  const socialSnap = await getDoc(socialRef);

  if (!socialSnap.exists() || !socialSnap.data().receivedRequests?.length) {
    requestsList.innerHTML = "<p>No friend requests.</p>";
    return;
  }

  const requests = socialSnap.data().receivedRequests;
  const requesterProfiles = await Promise.all(requests.map((id) => getUserProfile(id)));

  requestsList.innerHTML = "";
  for (const req of requesterProfiles) {
    const card = document.createElement("div");
    card.classList.add("friend-card");

    card.innerHTML = `
      <strong>${req.username}</strong>
      <span class="xp-badge">⭐ ${req.xp} XP</span>
      <div class="btn-container">
        <button class="btn-accept">Accept</button>
        <button class="btn-reject">Reject</button>
      </div>
    `;

    card.querySelector(".btn-accept").addEventListener("click", async () => {
      await acceptRequest(uid, req.uid);
      await reloadAll(uid);
    });

    card.querySelector(".btn-reject").addEventListener("click", async () => {
      await rejectRequest(uid, req.uid);
      await reloadAll(uid);
    });

    requestsList.appendChild(card);
  }
}

// 🔸 Reject Friend Request
async function rejectRequest(currentUid, fromUid) {
  const currentSocialRef = doc(db, "users", currentUid, "data", "social");
  const fromSocialRef = doc(db, "users", fromUid, "data", "social");

  await updateDoc(currentSocialRef, {
    receivedRequests: arrayRemove(fromUid),
    updatedAt: serverTimestamp(),
  });

  await updateDoc(fromSocialRef, {
    sentRequests: arrayRemove(currentUid),
    updatedAt: serverTimestamp(),
  });
}
