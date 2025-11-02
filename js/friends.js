// import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
// import {
//   getFirestore,
//   collection,
//   getDocs,
//   doc,
//   getDoc,
//   updateDoc,
//   arrayUnion,
// } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
// import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
// import { firebaseConfig } from "./firebase-config.js";

// // Initialize Firebase
// const app = initializeApp(firebaseConfig);
// const db = getFirestore(app);
// const auth = getAuth(app);

// const allUsersList = document.getElementById("allUsersList");
// const friendsList = document.getElementById("friendsList");

// onAuthStateChanged(auth, async (user) => {
//   if (!user) {
//     allUsersList.innerHTML = "<p>Please login first.</p>";
//     friendsList.innerHTML = "<p>Please login first.</p>";
//     return;
//   }

//   console.log("👤 Logged in user:", user.uid, user.displayName);

//   await loadAllUsers(user.uid);
//   await loadFriends(user.uid);
// });

// async function loadAllUsers(currentUid) {
//   allUsersList.innerHTML = "<p>Loading users...</p>";

//   const usersRef = collection(db, "users");
//   const snapshot = await getDocs(usersRef);
//   console.log("📊 Total users fetched:", snapshot.size);

//   if (snapshot.empty) {
//     allUsersList.innerHTML = "<p>No users found.</p>";
//     return;
//   }

//   allUsersList.innerHTML = "";

//   snapshot.forEach((docSnap) => {
//     const data = docSnap.data();
//     const uid = docSnap.id;

//     console.log("👥 User:", uid, data);

//     // Skip yourself
//     if (uid === currentUid) return;

//     const card = document.createElement("div");
//     card.classList.add("friend-card");

//     const name = document.createElement("span");
//     name.textContent = data.username || "Unnamed";

//     const xp = document.createElement("span");
//     xp.textContent = `${data.xp || 0} XP`;

//     const btn = document.createElement("button");
//     btn.textContent = "Add Friend";

//     btn.addEventListener("click", async () => {
//       const currentUserRef = doc(db, "users", currentUid);
//       const currentSnap = await getDoc(currentUserRef);
//       const currentData = currentSnap.data();
//       const currentFriends = currentData.friends || [];

//       if (currentFriends.includes(uid)) {
//         alert("Already friends!");
//         return;
//       }

//       await updateDoc(currentUserRef, {
//         friends: arrayUnion(uid),
//       });

//       alert(`${data.username} added as friend!`);
//       loadFriends(currentUid);
//     });

//     card.appendChild(name);
//     card.appendChild(xp);
//     card.appendChild(btn);
//     allUsersList.appendChild(card);
//   });
// }

// async function loadFriends(uid) {
//   friendsList.innerHTML = "<p>Loading friends...</p>";

//   const userRef = doc(db, "users", uid);
//   const userSnap = await getDoc(userRef);
//   if (!userSnap.exists()) {
//     friendsList.innerHTML = "<p>No friends yet.</p>";
//     return;
//   }

//   const data = userSnap.data();
//   const friends = data.friends || [];

//   if (friends.length === 0) {
//     friendsList.innerHTML = "<p>No friends yet.</p>";
//     return;
//   }

//   friendsList.innerHTML = "";
//   for (const friendId of friends) {
//     const friendRef = doc(db, "users", friendId);
//     const friendSnap = await getDoc(friendRef);
//     if (friendSnap.exists()) {
//       const friendData = friendSnap.data();
//       const div = document.createElement("div");
//       div.classList.add("friend-card");
//       div.innerHTML = `
//         <span>${friendData.username || "Unnamed"}</span>
//         <span>${friendData.xp || 0} XP</span>
//       `;
//       friendsList.appendChild(div);
//     }
//   }
// }


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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const allUsersList = document.getElementById("allUsersList");
const friendsList = document.getElementById("friendsList");
const requestsList = document.getElementById("requestsList");

let currentUser = null;
let currentUserData = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    allUsersList.innerHTML = "<p>Please login first.</p>";
    friendsList.innerHTML = "<p>Please login first.</p>";
    if (requestsList) requestsList.innerHTML = "<p>Please login first.</p>";
    return;
  }

  currentUser = user;
  console.log("👤 Logged in user:", user.uid);

  // Initialize user's social data if it doesn't exist
  await initializeSocialData(user.uid);
  
  await loadCurrentUserData(user.uid);
  await loadAllUsers(user.uid);
  await loadFriends(user.uid);
  await loadFriendRequests(user.uid);
});

// Initialize social data structure
async function initializeSocialData(uid) {
  const socialRef = doc(db, "users", uid, "data", "social");
  const socialSnap = await getDoc(socialRef);
  
  if (!socialSnap.exists()) {
    await setDoc(socialRef, {
      friends: [],
      sentRequests: [],
      receivedRequests: [],
      updatedAt: serverTimestamp()
    });
  }
}

// Load current user's data
async function loadCurrentUserData(uid) {
  const socialRef = doc(db, "users", uid, "data", "social");
  const socialSnap = await getDoc(socialRef);
  
  if (socialSnap.exists()) {
    currentUserData = socialSnap.data();
  } else {
    currentUserData = { friends: [], sentRequests: [], receivedRequests: [] };
  }
}

// Get user profile data
async function getUserProfile(uid) {
  const profileRef = doc(db, "users", uid, "data", "profile");
  const statsRef = doc(db, "users", uid, "data", "stats");
  
  const [profileSnap, statsSnap] = await Promise.all([
    getDoc(profileRef),
    getDoc(statsRef)
  ]);
  
  const profile = profileSnap.exists() ? profileSnap.data() : {};
  const stats = statsSnap.exists() ? statsSnap.data() : {};
  
  return {
    username: profile.username || "User",
    email: profile.email || "",
    xp: stats.xp || 0,
    streak: stats.streak || 0
  };
}

// Load all users
async function loadAllUsers(currentUid) {
  allUsersList.innerHTML = "<p>Loading users...</p>";

  try {
    // Get all user IDs from the users collection
    const usersRef = collection(db, "users");
    const snapshot = await getDocs(usersRef);
    
    if (snapshot.empty) {
      allUsersList.innerHTML = "<p>No users found.</p>";
      return;
    }

    allUsersList.innerHTML = "";
    let userCount = 0;

    for (const docSnap of snapshot.docs) {
      const uid = docSnap.id;
      
      // Skip yourself
      if (uid === currentUid) continue;

      const userData = await getUserProfile(uid);
      
      const card = document.createElement("div");
      card.classList.add("friend-card");

      const info = document.createElement("div");
      info.classList.add("friend-info");
      info.innerHTML = `
        <strong>${userData.username}</strong>
        <span class="xp-badge">⭐ ${userData.xp} XP | 🔥 ${userData.streak} days</span>
      `;

      const btn = document.createElement("button");
      
      // Determine button state
      if (currentUserData.friends.includes(uid)) {
        btn.textContent = "Friends ✓";
        btn.classList.add("btn-friends");
        btn.addEventListener("click", async () => {
          if (confirm(`Remove ${userData.username} from friends?`)) {
            await removeFriend(currentUid, uid);
            await loadAllUsers(currentUid);
            await loadFriends(currentUid);
          }
        });
      } else if (currentUserData.sentRequests.includes(uid)) {
        btn.textContent = "Requested";
        btn.classList.add("btn-requested");
        btn.addEventListener("click", async () => {
          if (confirm("Cancel friend request?")) {
            await cancelRequest(currentUid, uid);
            await loadAllUsers(currentUid);
          }
        });
      } else if (currentUserData.receivedRequests.includes(uid)) {
        btn.textContent = "Accept Request";
        btn.classList.add("btn-accept");
        btn.addEventListener("click", async () => {
          await acceptRequest(currentUid, uid);
          await loadAllUsers(currentUid);
          await loadFriends(currentUid);
          await loadFriendRequests(currentUid);
        });
      } else {
        btn.textContent = "Add Friend";
        btn.classList.add("btn-add");
        btn.addEventListener("click", async () => {
          await sendFriendRequest(currentUid, uid);
          alert(`Friend request sent to ${userData.username}!`);
          await loadAllUsers(currentUid);
        });
      }

      card.appendChild(info);
      card.appendChild(btn);
      allUsersList.appendChild(card);
      userCount++;
    }

    if (userCount === 0) {
      allUsersList.innerHTML = "<p>No other users found.</p>";
    }
  } catch (error) {
    console.error("Error loading users:", error);
    allUsersList.innerHTML = "<p>❌ Error loading users.</p>";
  }
}

// Send friend request
async function sendFriendRequest(fromUid, toUid) {
  const fromSocialRef = doc(db, "users", fromUid, "data", "social");
  const toSocialRef = doc(db, "users", toUid, "data", "social");

  await updateDoc(fromSocialRef, {
    sentRequests: arrayUnion(toUid),
    updatedAt: serverTimestamp()
  });

  await updateDoc(toSocialRef, {
    receivedRequests: arrayUnion(fromUid),
    updatedAt: serverTimestamp()
  });

  await loadCurrentUserData(fromUid);
}

// Cancel friend request
async function cancelRequest(fromUid, toUid) {
  const fromSocialRef = doc(db, "users", fromUid, "data", "social");
  const toSocialRef = doc(db, "users", toUid, "data", "social");

  await updateDoc(fromSocialRef, {
    sentRequests: arrayRemove(toUid),
    updatedAt: serverTimestamp()
  });

  await updateDoc(toSocialRef, {
    receivedRequests: arrayRemove(fromUid),
    updatedAt: serverTimestamp()
  });

  await loadCurrentUserData(fromUid);
}

// Accept friend request
async function acceptRequest(currentUid, fromUid) {
  const currentSocialRef = doc(db, "users", currentUid, "data", "social");
  const fromSocialRef = doc(db, "users", fromUid, "data", "social");

  // Remove from requests
  await updateDoc(currentSocialRef, {
    receivedRequests: arrayRemove(fromUid),
    friends: arrayUnion(fromUid),
    updatedAt: serverTimestamp()
  });

  await updateDoc(fromSocialRef, {
    sentRequests: arrayRemove(currentUid),
    friends: arrayUnion(currentUid),
    updatedAt: serverTimestamp()
  });

  await loadCurrentUserData(currentUid);
}

// Reject friend request
async function rejectRequest(currentUid, fromUid) {
  const currentSocialRef = doc(db, "users", currentUid, "data", "social");
  const fromSocialRef = doc(db, "users", fromUid, "data", "social");

  await updateDoc(currentSocialRef, {
    receivedRequests: arrayRemove(fromUid),
    updatedAt: serverTimestamp()
  });

  await updateDoc(fromSocialRef, {
    sentRequests: arrayRemove(currentUid),
    updatedAt: serverTimestamp()
  });

  await loadCurrentUserData(currentUid);
}

// Remove friend
async function removeFriend(currentUid, friendUid) {
  const currentSocialRef = doc(db, "users", currentUid, "data", "social");
  const friendSocialRef = doc(db, "users", friendUid, "data", "social");

  await updateDoc(currentSocialRef, {
    friends: arrayRemove(friendUid),
    updatedAt: serverTimestamp()
  });

  await updateDoc(friendSocialRef, {
    friends: arrayRemove(currentUid),
    updatedAt: serverTimestamp()
  });

  await loadCurrentUserData(currentUid);
}

// Load friends list
async function loadFriends(uid) {
  friendsList.innerHTML = "<p>Loading friends...</p>";

  const socialRef = doc(db, "users", uid, "data", "social");
  const socialSnap = await getDoc(socialRef);
  
  if (!socialSnap.exists()) {
    friendsList.innerHTML = "<p>No friends yet. Add some friends!</p>";
    return;
  }

  const friends = socialSnap.data().friends || [];

  if (friends.length === 0) {
    friendsList.innerHTML = "<p>No friends yet. Add some friends!</p>";
    return;
  }

  friendsList.innerHTML = "";
  
  for (const friendId of friends) {
    const friendData = await getUserProfile(friendId);
    
    const card = document.createElement("div");
    card.classList.add("friend-card");
    
    const info = document.createElement("div");
    info.classList.add("friend-info");
    info.innerHTML = `
      <strong>${friendData.username}</strong>
      <span class="xp-badge">⭐ ${friendData.xp} XP | 🔥 ${friendData.streak} days</span>
    `;

    const btn = document.createElement("button");
    btn.textContent = "Remove";
    btn.classList.add("btn-remove");
    btn.addEventListener("click", async () => {
      if (confirm(`Remove ${friendData.username} from friends?`)) {
        await removeFriend(uid, friendId);
        await loadFriends(uid);
        await loadAllUsers(uid);
      }
    });

    card.appendChild(info);
    card.appendChild(btn);
    friendsList.appendChild(card);
  }
}

// Load friend requests
async function loadFriendRequests(uid) {
  if (!requestsList) return; // If requests section doesn't exist in HTML

  requestsList.innerHTML = "<p>Loading requests...</p>";

  const socialRef = doc(db, "users", uid, "data", "social");
  const socialSnap = await getDoc(socialRef);
  
  if (!socialSnap.exists()) {
    requestsList.innerHTML = "<p>No friend requests.</p>";
    return;
  }

  const requests = socialSnap.data().receivedRequests || [];

  if (requests.length === 0) {
    requestsList.innerHTML = "<p>No friend requests.</p>";
    return;
  }

  requestsList.innerHTML = "";
  
  for (const requesterId of requests) {
    const requesterData = await getUserProfile(requesterId);
    
    const card = document.createElement("div");
    card.classList.add("friend-card");
    
    const info = document.createElement("div");
    info.classList.add("friend-info");
    info.innerHTML = `
      <strong>${requesterData.username}</strong>
      <span class="xp-badge">⭐ ${requesterData.xp} XP</span>
    `;

    const btnContainer = document.createElement("div");
    btnContainer.classList.add("btn-container");

    const acceptBtn = document.createElement("button");
    acceptBtn.textContent = "Accept";
    acceptBtn.classList.add("btn-accept");
    acceptBtn.addEventListener("click", async () => {
      await acceptRequest(uid, requesterId);
      await loadFriendRequests(uid);
      await loadFriends(uid);
      await loadAllUsers(uid);
    });

    const rejectBtn = document.createElement("button");
    rejectBtn.textContent = "Reject";
    rejectBtn.classList.add("btn-reject");
    rejectBtn.addEventListener("click", async () => {
      await rejectRequest(uid, requesterId);
      await loadFriendRequests(uid);
      await loadAllUsers(uid);
    });

    btnContainer.appendChild(acceptBtn);
    btnContainer.appendChild(rejectBtn);
    card.appendChild(info);
    card.appendChild(btnContainer);
    requestsList.appendChild(card);
  }
}