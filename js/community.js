import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  increment
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

const createBtn = document.getElementById("create-btn");
const backBtn = document.getElementById("back-btn");
const challengesList = document.getElementById("challenges-list");

let user = null;

// Redirect if not logged in
onAuthStateChanged(auth, (u) => {
  if (!u) window.location.href = "index.html";
  user = u;
});

// Fetch challenges
async function loadChallenges() {
  challengesList.innerHTML = "<p>Loading challenges...</p>";
  const querySnap = await getDocs(collection(db, "challenges"));
  challengesList.innerHTML = "";

  querySnap.forEach((docSnap) => {
    const c = docSnap.data();
    const div = document.createElement("div");
    div.classList.add("challenge-card");
    div.innerHTML = `
      <h4>${c.title}</h4>
      <p>${c.goal}</p>
      <p>⏱️ Duration: ${c.duration}</p>
      <p class="participants">👥 Participants: ${c.participants || 0}</p>
      <p>🏁 Created by: ${c.createdBy}</p>
      <button class="join-btn" data-id="${docSnap.id}">Join</button>
    `;
    challengesList.appendChild(div);
  });

  document.querySelectorAll(".join-btn").forEach((btn) =>
    btn.addEventListener("click", async (e) => {
      const id = e.target.dataset.id;
      await updateDoc(doc(db, "challenges", id), {
        participants: increment(1)
      });
      loadChallenges();
    })
  );
}

loadChallenges();

// Create new challenge
createBtn.addEventListener("click", async () => {
  const title = document.getElementById("title").value.trim();
  const goal = document.getElementById("goal").value.trim();
  const duration = document.getElementById("duration").value.trim();

  if (!title || !goal) return alert("Please fill all fields!");

  await addDoc(collection(db, "challenges"), {
    title,
    goal,
    duration: duration || "—",
    participants: 0,
    createdBy: user?.displayName || "Anonymous",
  });

  document.getElementById("title").value = "";
  document.getElementById("goal").value = "";
  document.getElementById("duration").value = "";

  alert("✅ Challenge created!");
  loadChallenges();
});

// Back to dashboard
backBtn.addEventListener("click", () => {
  window.location.href = "dashboard.html";
});
