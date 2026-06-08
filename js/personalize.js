import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// State Variables
let userUID = null;
let currentPlanType = "days";
let currentSlotsCount = 3;
let categoriesList = ["Upper", "Lower", "Push", "Pull", "Legs", "Cardio"];
let currentTheme = "cyan";
let currentPreferredTime = "morning";
let isOnboarding = false;

// Theme Accent Color Map
const themeColors = {
  cyan: "#06b6d4",
  emerald: "#10b981",
  amber: "#f59e0b",
  rose: "#f43f5e"
};

// DOM Elements
const onboardingBanner = document.getElementById("onboardingBanner");
const backBtn = document.getElementById("backBtn");
const submitBtn = document.getElementById("submitBtn");
const personalizeForm = document.getElementById("personalizeForm");

const optDays = document.getElementById("opt-days");
const optSlots = document.getElementById("opt-slots");
const slotsWidget = document.getElementById("slotsWidget");
const slotCountEl = document.getElementById("slot-count");
const btnSlotMinus = document.getElementById("btn-slot-minus");
const btnSlotPlus = document.getElementById("btn-slot-plus");

const categoryListContainer = document.getElementById("categoryList");
const newCategoryInput = document.getElementById("newCategoryInput");
const addCategoryBtn = document.getElementById("addCategoryBtn");

const waterGoalSlider = document.getElementById("waterGoalSlider");
const waterValText = document.getElementById("waterValText");

const themeOptions = document.querySelectorAll(".theme-option");
const timeOptions = document.querySelectorAll(".time-option");

// Initialize query params
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get("new") === "true") {
  isOnboarding = true;
  onboardingBanner.style.display = "block";
  backBtn.style.display = "none";
  submitBtn.textContent = "Finish Onboarding & Enter Dashboard 🚀";
}

// Plan Type Selection
optDays.addEventListener("click", () => selectPlanType("days"));
optSlots.addEventListener("click", () => selectPlanType("slots"));

function selectPlanType(type) {
  currentPlanType = type;
  if (type === "days") {
    optDays.classList.add("selected");
    optSlots.classList.remove("selected");
    slotsWidget.style.display = "none";
  } else {
    optSlots.classList.add("selected");
    optDays.classList.remove("selected");
    slotsWidget.style.display = "block";
  }
}

// Slots Manager
btnSlotMinus.addEventListener("click", () => {
  if (currentSlotsCount > 1) {
    currentSlotsCount--;
    slotCountEl.textContent = currentSlotsCount;
  }
});
btnSlotPlus.addEventListener("click", () => {
  if (currentSlotsCount < 20) {
    currentSlotsCount++;
    slotCountEl.textContent = currentSlotsCount;
  }
});

// Render Category Tags
function renderCategories() {
  categoryListContainer.innerHTML = "";
  categoriesList.forEach((cat, index) => {
    const tag = document.createElement("div");
    tag.className = "category-tag";
    tag.innerHTML = `
      <span>${cat}</span>
      <button type="button" data-index="${index}">&times;</button>
    `;
    tag.querySelector("button").addEventListener("click", (e) => {
      const idx = parseInt(e.target.dataset.index);
      categoriesList.splice(idx, 1);
      renderCategories();
    });
    categoryListContainer.appendChild(tag);
  });
}

// Add Category Tag
addCategoryBtn.addEventListener("click", () => {
  const value = newCategoryInput.value.trim();
  if (!value) return;
  if (categoriesList.includes(value)) {
    if (window.showToast) window.showToast("⚠️ Category already exists!", "warning");
    else alert("⚠️ Category already exists!");
    return;
  }
  categoriesList.push(value);
  newCategoryInput.value = "";
  renderCategories();
});

// Water Slider listener
waterGoalSlider.addEventListener("input", (e) => {
  waterValText.textContent = e.target.value;
});

// Theme Selector
themeOptions.forEach(opt => {
  opt.addEventListener("click", () => {
    themeOptions.forEach(o => o.classList.remove("selected"));
    opt.classList.add("selected");
    currentTheme = opt.dataset.theme;
    
    // Dynamically preview accent color on root document
    const colorHex = themeColors[currentTheme];
    document.documentElement.style.setProperty("--color-accent", colorHex);
  });
});

// Time Selector
timeOptions.forEach(opt => {
  opt.addEventListener("click", () => {
    timeOptions.forEach(o => o.classList.remove("selected"));
    opt.classList.add("selected");
    currentPreferredTime = opt.dataset.time;
  });
});

// Listen to Auth State
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  userUID = user.uid;

  if (window.GymifyLoader) window.GymifyLoader.show("Loading personalization settings...");

  try {
    const personalizeRef = doc(db, "users", user.uid, "data", "personalization");
    const snap = await getDoc(personalizeRef);

    if (snap.exists()) {
      const data = snap.data();
      currentPlanType = data.planType || "days";
      currentSlotsCount = data.slotsCount || 3;
      categoriesList = data.categories || ["Upper", "Lower", "Push", "Pull", "Legs", "Cardio"];
      currentTheme = data.theme || "cyan";
      currentPreferredTime = data.preferredTime || "morning";
      const waterGoal = data.waterGoal || 10;

      // Update inputs
      selectPlanType(currentPlanType);
      slotCountEl.textContent = currentSlotsCount;
      waterGoalSlider.value = waterGoal;
      waterValText.textContent = waterGoal;

      // Select Theme option
      themeOptions.forEach(o => {
        o.classList.toggle("selected", o.dataset.theme === currentTheme);
      });
      // Apply theme preview
      const colorHex = themeColors[currentTheme] || themeColors.cyan;
      document.documentElement.style.setProperty("--color-accent", colorHex);

      // Select Time option
      timeOptions.forEach(o => {
        o.classList.toggle("selected", o.dataset.time === currentPreferredTime);
      });
    } else {
      // Default initial states
      selectPlanType("days");
      renderCategories();
    }

    renderCategories();
  } catch (err) {
    console.error("Error loading personalization:", err);
    if (window.showToast) window.showToast("❌ Error loading settings.", "error");
  } finally {
    if (window.GymifyLoader) window.GymifyLoader.hide();
  }
});

// Form Submission
personalizeForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!userUID) return;

  if (window.GymifyLoader) {
    window.GymifyLoader.show("Saving preferences...");
  }

  const payload = {
    planType: currentPlanType,
    slotsCount: currentPlanType === "slots" ? currentSlotsCount : 0,
    categories: categoriesList,
    theme: currentTheme,
    waterGoal: parseInt(waterGoalSlider.value),
    preferredTime: currentPreferredTime,
    updatedAt: new Date().toISOString()
  };

  try {
    const personalizeRef = doc(db, "users", userUID, "data", "personalization");
    await setDoc(personalizeRef, payload);

    // Save Theme color locally for instant rendering
    const colorHex = themeColors[currentTheme];
    localStorage.setItem("gymify-theme-accent", colorHex);

    if (window.GymifyLoader) window.GymifyLoader.hide();
    if (window.showToast) window.showToast("✅ Settings Saved Successfully!", "success");

    setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 1200);
  } catch (err) {
    console.error("Error saving personalization:", err);
    if (window.GymifyLoader) window.GymifyLoader.hide();
    if (window.showToast) window.showToast("❌ Could not save settings.", "error");
  }
});
