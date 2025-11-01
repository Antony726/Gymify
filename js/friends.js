import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const allUsersList = document.getElementById("allUsersList");
const friendsList = document.getElementById("friendsList");

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    allUsersList.innerHTML = "<p>Please login first.</p>";
    friendsList.innerHTML = "<p>Please login first.</p>";
    return;
  }

  console.log("👤 Logged in user:", user.uid, user.displayName);

  await loadAllUsers(user.uid);
  await loadFriends(user.uid);
});

async function loadAllUsers(currentUid) {
  allUsersList.innerHTML = "<p>Loading users...</p>";

  const usersRef = collection(db, "users");
  const snapshot = await getDocs(usersRef);
  console.log("📊 Total users fetched:", snapshot.size);

  if (snapshot.empty) {
    allUsersList.innerHTML = "<p>No users found.</p>";
    return;
  }

  allUsersList.innerHTML = "";

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const uid = docSnap.id;

    console.log("👥 User:", uid, data);

    // Skip yourself
    if (uid === currentUid) return;

    const card = document.createElement("div");
    card.classList.add("friend-card");

    const name = document.createElement("span");
    name.textContent = data.username || "Unnamed";

    const xp = document.createElement("span");
    xp.textContent = `${data.xp || 0} XP`;

    const btn = document.createElement("button");
    btn.textContent = "Add Friend";

    btn.addEventListener("click", async () => {
      const currentUserRef = doc(db, "users", currentUid);
      const currentSnap = await getDoc(currentUserRef);
      const currentData = currentSnap.data();
      const currentFriends = currentData.friends || [];

      if (currentFriends.includes(uid)) {
        alert("Already friends!");
        return;
      }

      await updateDoc(currentUserRef, {
        friends: arrayUnion(uid),
      });

      alert(`${data.username} added as friend!`);
      loadFriends(currentUid);
    });

    card.appendChild(name);
    card.appendChild(xp);
    card.appendChild(btn);
    allUsersList.appendChild(card);
  });
}

async function loadFriends(uid) {
  friendsList.innerHTML = "<p>Loading friends...</p>";

  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) {
    friendsList.innerHTML = "<p>No friends yet.</p>";
    return;
  }

  const data = userSnap.data();
  const friends = data.friends || [];

  if (friends.length === 0) {
    friendsList.innerHTML = "<p>No friends yet.</p>";
    return;
  }

  friendsList.innerHTML = "";
  for (const friendId of friends) {
    const friendRef = doc(db, "users", friendId);
    const friendSnap = await getDoc(friendRef);
    if (friendSnap.exists()) {
      const friendData = friendSnap.data();
      const div = document.createElement("div");
      div.classList.add("friend-card");
      div.innerHTML = `
        <span>${friendData.username || "Unnamed"}</span>
        <span>${friendData.xp || 0} XP</span>
      `;
      friendsList.appendChild(div);
    }
  }
}
