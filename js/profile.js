import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, collection, addDoc, getDocs
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// DOM Elements
const avatarGrid = document.getElementById("avatarGrid");
const gymSelect = document.getElementById("gymSelect");
const profileForm = document.getElementById("profileForm");
const birthdayMsg = document.getElementById("birthdayMsg");
const qrcodeContainer = document.getElementById("qrcode");

const modal = document.getElementById("addGymModal");
const addGymBtn = document.getElementById("addGymBtn");
const closeModal = document.getElementById("closeModal");
const saveGymBtn = document.getElementById("saveGymBtn");
const newGymName = document.getElementById("newGymName");
const newGymArea = document.getElementById("newGymArea");

const avatars = Array.from({ length: 7 }, (_, i) => `avatar${i + 1}.jpg`);
let selectedAvatar = null;
let userUID = null;

// 🧑 Render avatars dynamically
avatars.forEach(img => {
  avatarGrid.innerHTML += `
    <img src="assets/avatars/${img}" class="avatar-option" data-name="${img}" alt="${img}">
  `;
});

document.addEventListener("click", (e) => {
  if (e.target.classList.contains("avatar-option")) {
    document.querySelectorAll(".avatar-option").forEach(a => a.classList.remove("selected"));
    e.target.classList.add("selected");
    selectedAvatar = e.target.dataset.name;
  }
});

// 🏋️ Load gyms properly (no overwriting)
async function loadGyms(selectedGym = "") {
  gymSelect.innerHTML = `<option value="">Select your gym...</option>`;
  const gymsRef = collection(db, "gyms");
  const snapshot = await getDocs(gymsRef);

  snapshot.forEach(docSnap => {
    const gym = docSnap.data();
    const option = document.createElement("option");
    option.value = gym.name;
    option.textContent = `${gym.name} (${gym.area})`;
    if (gym.name === selectedGym) option.selected = true;
    gymSelect.appendChild(option);
  });

  const addOption = document.createElement("option");
  addOption.value = "addNew";
  addOption.textContent = "➕ Add New Gym";
  gymSelect.appendChild(addOption);
}
// 🏋️ Auto-fill area when selecting a gym
gymSelect.addEventListener("change", async () => {
  const selected = gymSelect.value;
  if (selected === "addNew") {
    modal.style.display = "flex";
    return;
  }

  if (!selected) return;

  const gymsRef = collection(db, "gyms");
  const snapshot = await getDocs(gymsRef);

  snapshot.forEach((docSnap) => {
    const gym = docSnap.data();
    if (gym.name === selected) {
      document.getElementById("gymArea").value = gym.area || "";
    }
  });
});

// 🧱 Modal open/close
addGymBtn.addEventListener("click", () => {
  modal.style.display = "flex";
});

closeModal.addEventListener("click", () => {
  modal.style.display = "none";
});

saveGymBtn.addEventListener("click", async () => {
  const name = newGymName.value.trim();
  const area = newGymArea.value.trim();
  if (!name || !area) return alert("Please fill both fields.");
  try {
    await addDoc(collection(db, "gyms"), { name, area });
    alert("✅ Gym added successfully!");
    modal.style.display = "none";
    newGymName.value = "";
    newGymArea.value = "";
    await loadGyms(name);
  } catch (err) {
    console.error("Error adding gym:", err);
    alert("⚠️ Could not add gym. Try again.");
  }
});

// 👀 Auth listener
onAuthStateChanged(auth, async (user) => {
  if (!user) return (window.location.href = "login.html");
  userUID = user.uid;

  await loadGyms();

  const profileRef = doc(db, "users", user.uid, "data", "profile");
  const snap = await getDoc(profileRef);
  if (snap.exists()) {
    const data = snap.data();
    document.getElementById("username").value = data.username || "";
    document.getElementById("gymArea").value = data.gymArea || "";
    document.getElementById("dob").value = data.dob || "";
    document.getElementById("favMusic").value = data.favMusic || "";
    document.getElementById("fitnessGoal").value = data.fitnessGoal || "";
    selectedAvatar = data.avatar;

    document.querySelector(`img[data-name="${data.avatar}"]`)?.classList.add("selected");
    await loadGyms(data.gymName);
    generateQR(data);
    checkBirthday(data.dob, data.username);
  }
});

// 💾 Save profile
profileForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const profile = {
    username: document.getElementById("username").value.trim(),
    gymName: gymSelect.value,
    gymArea: document.getElementById("gymArea").value.trim(),
    dob: document.getElementById("dob").value,
    favMusic: document.getElementById("favMusic").value.trim(),
    fitnessGoal: document.getElementById("fitnessGoal").value.trim(),
    avatar: selectedAvatar || "avatar1.jpg",
  };

  await setDoc(doc(db, "users", userUID, "data", "profile"), profile);
  alert("✅ Profile Saved!");
  generateQR(profile);
  window.location.href = "dashboard.html";

});

// 🎫 Fun QR Code (no UID)
// 🎫 Fun QR Code (no UID, shortened for safety)
function generateQR(profile) {
  qrcodeContainer.innerHTML = "";

  // Light-weight text version
  let funText = `${profile.username || "GymBro"} | ${profile.gymName || "No Gym"} (${profile.gymArea || "No Area"}) | Goal: ${profile.fitnessGoal || "Stay Fit"} | Music: ${profile.favMusic || "Focus Mode"}`;

  if (funText.length > 120) funText = funText.substring(0, 120) + "...";

  try {
    new QRCode(qrcodeContainer, {
      text: funText,
      width: 180,
      height: 180,
      colorDark: "#66fcf1",
      colorLight: "#0b0c10",
      correctLevel: QRCode.CorrectLevel.L, // low correction = more capacity
    });
  } catch (err) {
    console.error("⚠️ QR generation error:", err);
    qrcodeContainer.innerHTML = `<p style="color:red;">⚠️ QR too large. Try shorter text or fewer emojis.</p>`;
  }
}


// 🎂 Birthday check
function checkBirthday(dob, username) {
  if (!dob) return;
  const today = new Date();
  const bday = new Date(dob);
  if (today.getMonth() === bday.getMonth() && today.getDate() === bday.getDate()) {
    birthdayMsg.textContent = `🎉 Happy Birthday, ${username}! 🎂`;
    birthdayMsg.classList.add("confetti");
    createConfetti();
  }
}

// 🎊 Small confetti animation
function createConfetti() {
  for (let i = 0; i < 30; i++) {
    const confetti = document.createElement("div");
    confetti.className = "confetti-piece";
    confetti.style.left = Math.random() * 100 + "vw";
    confetti.style.animationDuration = Math.random() * 3 + 2 + "s";
    confetti.style.background = ["#66fcf1", "#45a29e", "#ffcc00"][Math.floor(Math.random() * 3)];
    document.body.appendChild(confetti);
    setTimeout(() => confetti.remove(), 4000);
  }
}
