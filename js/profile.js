import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, collection, addDoc, getDocs
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";
import { buildProfileQRData, renderQRCode } from "./qr-utils.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// DOM Elements
const avatarGrid = document.getElementById("avatarGrid");
const gymSelect = document.getElementById("gymSelect");  // hidden native select
const profileForm = document.getElementById("profileForm");
const birthdayMsg = document.getElementById("birthdayMsg");
const qrcodeContainer = document.getElementById("qrcode");

const modal = document.getElementById("addGymModal");
const addGymBtn = document.getElementById("addGymBtn");
const closeModalBtn = document.getElementById("closeModal");
const saveGymBtn = document.getElementById("saveGymBtn");
const newGymName = document.getElementById("newGymName");
const newGymArea = document.getElementById("newGymArea");

// Custom Dropdown Elements
const dropdownTrigger = document.getElementById("gymDropdownTrigger");
const dropdownLabel = document.getElementById("gymDropdownLabel");
const dropdownList = document.getElementById("gymDropdownList");

// Live Preview Elements
const previewAvatarImg = document.getElementById("previewAvatarImg");
const previewName = document.getElementById("previewName");
const previewGym = document.getElementById("previewGym");
const previewGoalBadge = document.getElementById("previewGoalBadge");

// Location detect
const detectLocationBtn = document.getElementById("detectLocationBtn");

// Progress step elements
const step1 = document.getElementById("step1");
const step2 = document.getElementById("step2");
const step3 = document.getElementById("step3");
const step4 = document.getElementById("step4");
const line1 = document.getElementById("line1");
const line2 = document.getElementById("line2");
const line3 = document.getElementById("line3");

const avatars = Array.from({ length: 7 }, (_, i) => `avatar${i + 1}.jpg`);
let selectedAvatar = null;
let userUID = null;
let selectedGymValue = "";

// === 🧑 Render avatars ===
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
    // Update live preview
    previewAvatarImg.src = `assets/avatars/${selectedAvatar}`;
    updateStepProgress();
  }
});

// === Live Preview Updaters ===
const usernameInput = document.getElementById("username");
const fitnessGoalInput = document.getElementById("fitnessGoal");

usernameInput.addEventListener("input", () => {
  previewName.textContent = usernameInput.value.trim() || "GymBro";
  updateStepProgress();
});

fitnessGoalInput.addEventListener("input", () => {
  previewGoalBadge.textContent = fitnessGoalInput.value.trim() || "Stay Fit";
});

// === Custom Gym Dropdown ===
let dropdownOpen = false;

dropdownTrigger.addEventListener("click", (e) => {
  e.stopPropagation();
  dropdownOpen = !dropdownOpen;
  dropdownList.classList.toggle("open", dropdownOpen);
  dropdownTrigger.classList.toggle("open", dropdownOpen);
});

// Close dropdown when clicking outside
document.addEventListener("click", () => {
  if (dropdownOpen) {
    dropdownOpen = false;
    dropdownList.classList.remove("open");
    dropdownTrigger.classList.remove("open");
  }
});

dropdownList.addEventListener("click", (e) => {
  e.stopPropagation();
});

function selectGymDropdownItem(name, area) {
  selectedGymValue = name;
  dropdownLabel.textContent = name ? `${name} (${area || ""})` : "Select your gym...";
  gymSelect.value = name;
  previewGym.textContent = name ? `${name} — ${area || ""}` : "No gym selected";

  // auto-fill area
  if (area) {
    document.getElementById("gymArea").value = area;
  }

  // mark selected item visually
  dropdownList.querySelectorAll(".dropdown-item").forEach(item => {
    item.classList.toggle("selected", item.dataset.value === name);
  });

  // close
  dropdownOpen = false;
  dropdownList.classList.remove("open");
  dropdownTrigger.classList.remove("open");
  updateStepProgress();
}

// === 🏋️ Load gyms ===
async function loadGyms(selectedGym = "") {
  gymSelect.innerHTML = `<option value="">Select your gym...</option>`;
  dropdownList.innerHTML = "";

  const gymsRef = collection(db, "gyms");
  const snapshot = await getDocs(gymsRef);

  snapshot.forEach(docSnap => {
    const gym = docSnap.data();

    // Native hidden select
    const option = document.createElement("option");
    option.value = gym.name;
    option.textContent = `${gym.name} (${gym.area})`;
    if (gym.name === selectedGym) option.selected = true;
    gymSelect.appendChild(option);

    // Custom dropdown item
    const item = document.createElement("div");
    item.className = `dropdown-item ${gym.name === selectedGym ? "selected" : ""}`;
    item.dataset.value = gym.name;
    item.dataset.area = gym.area || "";
    item.textContent = `${gym.name} (${gym.area})`;
    item.addEventListener("click", () => selectGymDropdownItem(gym.name, gym.area));
    dropdownList.appendChild(item);
  });

  // Add New Gym item
  const addItem = document.createElement("div");
  addItem.className = "dropdown-item add-new";
  addItem.textContent = "➕ Add New Gym";
  addItem.addEventListener("click", () => {
    dropdownOpen = false;
    dropdownList.classList.remove("open");
    dropdownTrigger.classList.remove("open");
    modal.style.display = "flex";
  });
  dropdownList.appendChild(addItem);

  // If a gym was pre-selected, update the label
  if (selectedGym) {
    const matchedItem = dropdownList.querySelector(`[data-value="${selectedGym}"]`);
    if (matchedItem) {
      selectedGymValue = selectedGym;
      dropdownLabel.textContent = matchedItem.textContent;
      gymSelect.value = selectedGym;
    }
  }
}

// === 📍 Location Detection ===
if (detectLocationBtn) {
  detectLocationBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
      alert("⚠️ Geolocation is not supported by your browser.");
      return;
    }

    detectLocationBtn.classList.add("loading");
    detectLocationBtn.textContent = "⏳";

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        try {
          // Use Nominatim (OpenStreetMap) reverse geocoding — free, no API key
          const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`, {
            headers: { "Accept-Language": "en" }
          });
          const data = await resp.json();

          if (data && data.address) {
            const addr = data.address;
            // Build a readable area string from the components
            const parts = [
              addr.neighbourhood || addr.suburb || "",
              addr.city || addr.town || addr.village || "",
              addr.state || ""
            ].filter(Boolean);
            const areaText = parts.join(", ");
            document.getElementById("gymArea").value = areaText || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          } else {
            document.getElementById("gymArea").value = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          }
        } catch (err) {
          console.error("Reverse geocoding error:", err);
          document.getElementById("gymArea").value = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        }

        detectLocationBtn.classList.remove("loading");
        detectLocationBtn.textContent = "📍";
        updateStepProgress();
      },
      (error) => {
        console.error("Geolocation error:", error);
        alert("❌ Could not detect location. Please type it manually.");
        detectLocationBtn.classList.remove("loading");
        detectLocationBtn.textContent = "📍";
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

// === 🧱 Modal open/close ===
addGymBtn.addEventListener("click", () => {
  modal.style.display = "flex";
});

closeModalBtn.addEventListener("click", () => {
  modal.style.display = "none";
});

saveGymBtn.addEventListener("click", async () => {
  const name = newGymName.value.trim();
  const area = newGymArea.value.trim();
  if (!name || !area) {
    if (window.showToast) window.showToast("⚠️ Please fill both fields.", "warning");
    else alert("⚠️ Please fill both fields.");
    return;
  }
  try {
    await addDoc(collection(db, "gyms"), { name, area });
    if (window.showToast) window.showToast("✅ Gym added successfully!", "success");
    modal.style.display = "none";
    newGymName.value = "";
    newGymArea.value = "";
    await loadGyms(name);
    selectGymDropdownItem(name, area);
  } catch (err) {
    console.error("Error adding gym:", err);
    if (window.showToast) window.showToast("❌ Could not add gym. Try again.", "error");
    else alert("❌ Could not add gym.");
  }
});

// === Progress Step Tracker ===
function updateStepProgress() {
  const hasAvatar = !!selectedAvatar;
  const hasName = !!usernameInput.value.trim();
  const hasGym = !!selectedGymValue;
  const hasArea = !!document.getElementById("gymArea").value.trim();

  // Step 1: Avatar
  if (hasAvatar) {
    step1.classList.remove("active");
    step1.classList.add("done");
    step1.textContent = "✓";
    line1.classList.add("done");
  } else {
    step1.classList.add("active");
    step1.classList.remove("done");
    step1.textContent = "1";
    line1.classList.remove("done");
  }

  // Step 2: Identity
  if (hasName) {
    step2.classList.remove("active");
    step2.classList.add("done");
    step2.textContent = "✓";
    line2.classList.add("done");
    if (!hasAvatar) step2.classList.add("active");
  } else {
    step2.classList.remove("done");
    step2.textContent = "2";
    line2.classList.remove("done");
    if (hasAvatar) step2.classList.add("active");
  }

  // Step 3: Gym
  if (hasGym || hasArea) {
    step3.classList.remove("active");
    step3.classList.add("done");
    step3.textContent = "✓";
    line3.classList.add("done");
  } else {
    step3.classList.remove("done");
    step3.textContent = "3";
    line3.classList.remove("done");
    if (hasName && hasAvatar) step3.classList.add("active");
  }

  // Step 4: Save (always available)
  if (hasAvatar && hasName && (hasGym || hasArea)) {
    step4.classList.add("active");
    step4.classList.remove("done");
  } else {
    step4.classList.remove("active", "done");
  }
}

// Also watch area changes
document.getElementById("gymArea").addEventListener("input", updateStepProgress);

// === 👀 Auth listener ===
onAuthStateChanged(auth, async (user) => {
  if (!user) return (window.location.href = "login.html");
  userUID = user.uid;

  // Show custom loader
  if (window.GymifyLoader) window.GymifyLoader.show("Loading your profile...");

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

    // Highlight selected avatar
    const avatarEl = document.querySelector(`img[data-name="${data.avatar}"]`);
    if (avatarEl) avatarEl.classList.add("selected");

    // Update preview card
    previewAvatarImg.src = data.avatar ? `assets/avatars/${data.avatar}` : "assets/avatars/avatar1.jpg";
    previewName.textContent = data.username || "GymBro";
    previewGoalBadge.textContent = data.fitnessGoal || "Stay Fit";

    await loadGyms(data.gymName);

    if (data.gymName) {
      selectedGymValue = data.gymName;
      previewGym.textContent = `${data.gymName} — ${data.gymArea || ""}`;
    }

    generateQR(data);
    checkBirthday(data.dob, data.username);
    updateStepProgress();
  }

  // Hide loader
  if (window.GymifyLoader) window.GymifyLoader.hide();
});

// === 💾 Save profile ===
profileForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const profile = {
    username: document.getElementById("username").value.trim(),
    gymName: selectedGymValue,
    gymArea: document.getElementById("gymArea").value.trim(),
    dob: document.getElementById("dob").value,
    favMusic: document.getElementById("favMusic").value.trim(),
    fitnessGoal: document.getElementById("fitnessGoal").value.trim(),
    avatar: selectedAvatar || "avatar1.jpg",
  };

  // Show loader
  if (window.GymifyLoader) {
    window.GymifyLoader.show("Saving profile...");
    window.GymifyLoader.setProgress(30, "Writing character data...");
  }

  try {
    await setDoc(doc(db, "users", userUID, "data", "profile"), profile);

    if (window.GymifyLoader) window.GymifyLoader.setProgress(80, "Syncing leaderboard...");

    const statsRef = doc(db, "users", userUID, "data", "stats");
    const statsSnap = await getDoc(statsRef);
    const xp = statsSnap.exists() ? statsSnap.data().xp || 0 : 0;
    const streak = statsSnap.exists() ? statsSnap.data().streak || 0 : 0;
    await setDoc(doc(db, "leaderboard", userUID), {
      username: profile.username,
      xp,
      streak,
      updatedAt: new Date().toISOString()
    });

    generateQR(profile);

    // Mark step 4 as done
    step4.classList.remove("active");
    step4.classList.add("done");
    step4.textContent = "✓";

    if (window.GymifyLoader) window.GymifyLoader.hide();

    if (window.showToast) window.showToast("✅ Profile Saved!", "success");
    else alert("✅ Profile Saved!");

    setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 1200);
  } catch (err) {
    console.error("Error saving profile:", err);
    if (window.GymifyLoader) window.GymifyLoader.hide();
    if (window.showToast) window.showToast("❌ Could not save profile.", "error");
    else alert("❌ Could not save profile.");
  }
});

// === 🎫 QR Code ===
function generateQR(profile) {
  if (!userUID) return;
  const qrData = buildProfileQRData(userUID, profile.username);
  const ok = renderQRCode(qrcodeContainer, qrData);
  if (!ok) {
    qrcodeContainer.innerHTML = `<p style="color:var(--color-danger);font-size:12px;">⚠️ Could not generate QR</p>`;
    return;
  }
  const hint = document.createElement("p");
  hint.style.cssText = "font-size:10px;color:var(--text-secondary);margin-top:8px;";
  hint.textContent = "Friends scan this to add you instantly";
  qrcodeContainer.appendChild(hint);

  if (!document.getElementById("scanQrBtn")) {
    const scanBtn = document.createElement("button");
    scanBtn.id = "scanQrBtn";
    scanBtn.type = "button";
    scanBtn.className = "btn btn-secondary";
    scanBtn.style.cssText = "width:100%;margin-top:10px;font-size:12px;";
    scanBtn.textContent = "📷 Scan Someone's QR";
    scanBtn.onclick = () => { window.location.href = "scan.html"; };
    qrcodeContainer.parentElement.appendChild(scanBtn);
  }
}

// === 🎂 Birthday check ===
function checkBirthday(dob, username) {
  if (!dob) return;
  const today = new Date();
  const bday = new Date(dob);
  if (today.getMonth() === bday.getMonth() && today.getDate() === bday.getDate()) {
    birthdayMsg.style.display = "block";
    birthdayMsg.textContent = `🎉 Happy Birthday, ${username}! 🎂`;
    birthdayMsg.classList.add("confetti");
    createConfetti();
  }
}

// === 🎊 Confetti ===
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
