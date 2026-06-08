import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { initCustomDropdown, refreshCustomDropdown } from "./custom-dropdown.js";

const container = document.getElementById("days-container");
const form = document.getElementById("plan-form");
const backBtn = document.getElementById("back-btn");

let userId = null;
let planType = "days";
let slotsCount = 3;
let categoriesList = ["Upper", "Lower", "Push", "Pull", "Legs", "Cardio"];
let keys = [];

// Helper function to map AI days workout structure to slots
function mapDaysPlanToSlots(generatedDaysPlan, count) {
  // Extract all non-Rest days in order
  const activeDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    .map(d => ({ day: d, data: generatedDaysPlan[d] }))
    .filter(item => item.data && item.data.type !== "Rest");
    
  const slotsPlan = {};
  for (let i = 1; i <= count; i++) {
    const key = `Slot ${i}`;
    const activeItem = activeDays[i - 1];
    if (activeItem) {
      slotsPlan[key] = {
        type: activeItem.data.type,
        exercises: activeItem.data.exercises
      };
    } else {
      slotsPlan[key] = {
        type: "Rest",
        exercises: ""
      };
    }
  }
  return slotsPlan;
}

// Build dynamic form for each day/slot with premium accordion styling
function renderPlanForm(type, count, categories, currentPlanData) {
  container.innerHTML = "";

  keys.forEach(key => {
    const div = document.createElement("div");
    div.classList.add("day", "glass-card");
    div.style.margin = "12px 0";
    
    // Display name in UI
    const displayName = type === "slots" ? `Workout ${key}` : key;
    
    // Generate dropdown options dynamically
    let optionsHtml = `<option value="Rest">Rest Day</option>`;
    categories.forEach(cat => {
      optionsHtml += `<option value="${cat}">${cat}</option>`;
    });

    div.innerHTML = `
      <div class="day-header" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none;">
        <h3 style="margin: 0; font-size: 16px; display: flex; align-items: center; gap: 8px;">
          ${type === "slots" ? "🔄" : "📅"} <span class="day-title">${displayName}</span> 
          <span class="day-badge" style="font-size: 11px; background: rgba(255, 255, 255, 0.08); color: var(--text-secondary); padding: 2px 8px; border-radius: 20px;">Rest</span>
        </h3>
        <span class="accordion-arrow" style="transition: transform 0.3s ease; transform: rotate(0deg); font-size: 12px; color: var(--text-secondary);">▼</span>
      </div>
      <div class="day-content" style="display: none; margin-top: 15px; border-top: 1px solid var(--border-color); padding-top: 15px;">
        <div style="margin-bottom: 12px;">
          <label style="font-size: 12px; margin-bottom: 6px;">Workout Type</label>
          <select name="${key}-type" style="margin: 0;">
            ${optionsHtml}
          </select>
        </div>
        <div>
          <label style="font-size: 12px; margin-bottom: 6px;">Exercises (comma separated)</label>
          <textarea name="${key}-exercises" placeholder="Bench Press, Dips, Push-ups" style="margin: 0; height: 80px; resize: vertical;"></textarea>
        </div>
      </div>
    `;
    container.appendChild(div);

    const header = div.querySelector(".day-header");
    const content = div.querySelector(".day-content");
    const arrow = div.querySelector(".accordion-arrow");
    const typeSelect = div.querySelector(`[name="${key}-type"]`);
    const badge = div.querySelector(".day-badge");

    // Populate initial value if found in db
    if (currentPlanData[key]) {
      typeSelect.value = currentPlanData[key].type || "Rest";
      const exercisesTextarea = div.querySelector(`[name="${key}-exercises"]`);
      exercisesTextarea.value = currentPlanData[key].exercises || "";
    }

    initCustomDropdown(typeSelect);

    // Accordion toggle
    header.addEventListener("click", () => {
      const isVisible = content.style.display === "block";
      content.style.display = isVisible ? "none" : "block";
      arrow.style.transform = isVisible ? "rotate(0deg)" : "rotate(180deg)";
    });

    // Dynamic Badge update on type change
    typeSelect.addEventListener("change", () => {
      badge.textContent = typeSelect.value;
      if (typeSelect.value === "Rest") {
        badge.style.background = "rgba(255, 255, 255, 0.08)";
        badge.style.color = "var(--text-secondary)";
      } else {
        badge.style.background = "rgba(16, 185, 129, 0.15)";
        badge.style.color = "var(--color-success)";
      }
    });

    // Dispatch change event to set initial badge color correctly
    typeSelect.dispatchEvent(new Event("change"));
  });
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  userId = user.uid;

  if (window.GymifyLoader) window.GymifyLoader.show("Loading personalization settings...");

  try {
    // 1. Fetch Personalization settings
    const personalizeRef = doc(db, "users", userId, "data", "personalization");
    const personalizeSnap = await getDoc(personalizeRef);

    if (personalizeSnap.exists()) {
      const pData = personalizeSnap.data();
      planType = pData.planType || "days";
      slotsCount = pData.slotsCount || 3;
      categoriesList = pData.categories || ["Upper", "Lower", "Push", "Pull", "Legs", "Cardio"];
    }

    // Determine layout keys
    const titleEl = document.querySelector("h2.glow-text");
    if (planType === "slots") {
      keys = Array.from({ length: slotsCount }, (_, i) => `Slot ${i + 1}`);
      if (titleEl) titleEl.textContent = "🔄 Cycle Workout Plan";
    } else {
      keys = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
      if (titleEl) titleEl.textContent = "📅 Weekly Workout Plan";
    }

    // 2. Fetch Plan structure
    const planRef = doc(db, "users", userId, "data", "plan");
    const planSnap = await getDoc(planRef);
    let currentPlanData = {};
    if (planSnap.exists()) {
      currentPlanData = planSnap.data();
    }

    // Render forms
    renderPlanForm(planType, slotsCount, categoriesList, currentPlanData);
  } catch (err) {
    console.error("🔥 Error loading settings/plan:", err);
    if (window.showToast) window.showToast("⚠️ Failed to load plan data.", "error");
  } finally {
    if (window.GymifyLoader) window.GymifyLoader.hide();
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!userId) {
    if (window.showToast) window.showToast("❌ User not logged in!", "error");
    return;
  }

  const plan = {};
  keys.forEach(key => {
    const typeSelect = document.querySelector(`[name='${key}-type']`);
    const exercisesTextarea = document.querySelector(`[name='${key}-exercises']`);
    
    plan[key] = {
      type: typeSelect?.value || "Rest",
      exercises: exercisesTextarea?.value || ""
    };
  });

  const planRef = doc(db, "users", userId, "data", "plan");

  try {
    await setDoc(planRef, plan);
    if (window.showToast) window.showToast("✅ Plan saved successfully!", "success");
  } catch (err) {
    console.error("🔥 Error saving plan:", err);
    if (window.showToast) window.showToast(`❌ Failed to save plan: ${err.message}`, "error");
  }
});

backBtn.addEventListener("click", () => {
  window.location.href = "dashboard.html";
});

const exportBtn = document.getElementById("export-btn");
const importBtn = document.getElementById("import-btn");
const importBox = document.getElementById("import-box");

// 📤 EXPORT PLAN
exportBtn.addEventListener("click", async () => {
  if (!userId) {
    if (window.showToast) window.showToast("❌ Please log in first.", "error");
    return;
  }

  const planRef = doc(db, "users", userId, "data", "plan");

  try {
    const planSnap = await getDoc(planRef);
    if (!planSnap.exists()) {
      if (window.showToast) window.showToast("⚠️ No plan found to export.", "warning");
      return;
    }

    const plan = planSnap.data();
    const encodedPlan = btoa(JSON.stringify(plan)); // Base64 encode

    // Copy to clipboard
    await navigator.clipboard.writeText(encodedPlan);
    if (window.showToast) window.showToast("📋 Plan copied to clipboard!", "success");
  } catch (err) {
    console.error("Export failed:", err);
    if (window.showToast) window.showToast("❌ Failed to export plan.", "error");
  }
});

// 📥 IMPORT PLAN
importBtn.addEventListener("click", async () => {
  const code = importBox.value.trim();

  if (!code) {
    if (window.showToast) window.showToast("⚠️ Please paste a valid plan code.", "warning");
    return;
  }

  if (!userId) {
    if (window.showToast) window.showToast("❌ Please log in first.", "error");
    return;
  }

  try {
    const decodedPlan = JSON.parse(atob(code)); // decode Base64 → JSON

    const planRef = doc(db, "users", userId, "data", "plan");
    await setDoc(planRef, decodedPlan);

    // update UI immediately
    keys.forEach(key => {
      const typeSelect = document.querySelector(`[name='${key}-type']`);
      const exercisesTextarea = document.querySelector(`[name='${key}-exercises']`);

      if (decodedPlan[key]) {
        typeSelect.value = decodedPlan[key].type || "Rest";
        refreshCustomDropdown(typeSelect);
        typeSelect.dispatchEvent(new Event("change"));
        exercisesTextarea.value = decodedPlan[key].exercises || "";
      }
    });

    if (window.showToast) window.showToast("📥 Plan imported successfully!", "success");
    importBox.value = "";
  } catch (err) {
    console.error("Import failed:", err);
    if (window.showToast) window.showToast("❌ Invalid or corrupted plan code!", "error");
  }
});

// === 🪄 AI Wizard Modal Controller ===
const aiWizardBtn = document.getElementById("ai-wizard-btn");
const aiModal = document.getElementById("aiModal");
const closeAiModal = document.getElementById("closeAiModal");
const aiOptBtns = document.querySelectorAll(".ai-opt-btn");
const aiPrevBtns = document.querySelectorAll(".ai-prev-btn");
const aiGenerateBtn = document.getElementById("ai-generate-btn");

let aiSelections = {
  level: "",
  goal: "",
  days: ""
};

if (aiWizardBtn && aiModal) {
  aiWizardBtn.addEventListener("click", () => {
    aiSelections = { level: "", goal: "", days: "" };
    showAiStep(1);
    aiModal.style.display = "flex";
  });

  closeAiModal?.addEventListener("click", () => {
    aiModal.style.display = "none";
  });

  aiOptBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const step = parseInt(btn.dataset.step);
      const type = btn.dataset.type;
      const val = btn.dataset.val;

      aiSelections[type] = val;

      if (step < 3) {
        showAiStep(step + 1);
      } else {
        document.getElementById("summary-level").textContent = aiSelections.level;
        document.getElementById("summary-goal").textContent = aiSelections.goal;
        document.getElementById("summary-days").textContent = aiSelections.days + " Days Split";
        showAiStep(4);
      }
    });
  });

  aiPrevBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const prevStep = parseInt(btn.dataset.prev);
      showAiStep(prevStep);
    });
  });

  aiGenerateBtn?.addEventListener("click", () => {
    const generated = generatePlan(aiSelections.level, aiSelections.goal, aiSelections.days);
    
    let finalPlan = {};
    if (planType === "slots") {
      finalPlan = mapDaysPlanToSlots(generated, slotsCount);
    } else {
      finalPlan = generated;
    }

    keys.forEach(key => {
      const typeSelect = document.querySelector(`[name='${key}-type']`);
      const exercisesTextarea = document.querySelector(`[name='${key}-exercises']`);
      
      if (finalPlan[key]) {
        if (typeSelect) {
          typeSelect.value = finalPlan[key].type;
          refreshCustomDropdown(typeSelect);
          typeSelect.dispatchEvent(new Event("change"));
        }
        if (exercisesTextarea) {
          exercisesTextarea.value = finalPlan[key].exercises;
        }
      }
    });

    aiModal.style.display = "none";
    if (window.showToast) {
      window.showToast("🪄 AI Workout Plan generated! Don't forget to click Save Plan below.", "success");
    }
  });
}

function showAiStep(stepNum) {
  document.querySelectorAll(".ai-step").forEach(step => {
    step.style.display = "none";
  });
  document.getElementById(`ai-step-${stepNum}`).style.display = "block";
}

function generatePlan(level, goal, daysCount) {
  const plan = {};
  const tempDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  tempDays.forEach(d => {
    plan[d] = { type: "Rest", exercises: "" };
  });

  let reps = "3 sets x 10 reps";
  if (goal === "Strength") reps = "5 sets x 5 reps";
  if (goal === "Endurance") reps = "3 sets x 15-20 reps";

  if (daysCount === "3") {
    plan["Monday"] = {
      type: "Upper",
      exercises: `Bench Press (${reps}), Pull-Ups (3 sets), Dumbbell Shoulder Press (${reps}), Barbell Row (${reps})`
    };
    plan["Wednesday"] = {
      type: "Lower",
      exercises: `Barbell Squats (${reps}), Romanian Deadlift (${reps}), Lunges (${reps}), Calf Raises (${reps})`
    };
    plan["Friday"] = {
      type: "Core",
      exercises: `Hanging Leg Raises (3 sets), Push-Ups (3 sets), Planks (3 sets x 60s), Mountain Climbers (3 sets x 45s)`
    };
  } else if (daysCount === "4") {
    plan["Monday"] = {
      type: "Upper",
      exercises: `Bench Press (${reps}), Pull-Ups (3 sets), Shoulder Press (${reps}), Bicep Curls (3x12)`
    };
    plan["Tuesday"] = {
      type: "Lower",
      exercises: `Barbell Squats (${reps}), Romanian Deadlift (${reps}), Leg Extensions (${reps}), Calf Raises (3x15)`
    };
    plan["Thursday"] = {
      type: "Upper",
      exercises: `Incline Dumbbell Press (${reps}), Barbell Rows (${reps}), Tricep Dips (3x10), Lateral Raises (3x12)`
    };
    plan["Friday"] = {
      type: "Lower",
      exercises: `Leg Press (${reps}), Hamstring Curls (${reps}), Lunges (${reps}), Planks (3x60s)`
    };
  } else {
    plan["Monday"] = {
      type: "Push",
      exercises: `Bench Press (${reps}), Shoulder Press (${reps}), Incline Dumbbell Press (${reps}), Tricep Pushdowns (3x12)`
    };
    plan["Tuesday"] = {
      type: "Pull",
      exercises: `Deadlift (${reps}), Pull-Ups (3 sets), Barbell Row (${reps}), Dumbbell Bicep Curls (3x12)`
    };
    plan["Wednesday"] = {
      type: "Legs",
      exercises: `Squats (${reps}), Romanian Deadlift (${reps}), Lunges (${reps}), Calf Raises (3x15)`
    };
    plan["Friday"] = {
      type: "Push",
      exercises: `Incline Bench Press (${reps}), Lateral Raises (${reps}), Push-Ups (3x15), Tricep Dips (3x10)`
    };
    plan["Saturday"] = {
      type: "Pull",
      exercises: `Lat Pulldowns (${reps}), Cable Rows (${reps}), Hammer Curls (3x12), Hanging Leg Raises (3x15)`
    };
  }

  if (level === "Beginner") {
    Object.keys(plan).forEach(day => {
      if (plan[day].exercises) {
        plan[day].exercises = plan[day].exercises
          .replaceAll("5 sets x 5 reps", "3 sets x 8 reps")
          .replaceAll("3 sets", "2 sets");
      }
    });
  } else if (level === "Advanced") {
    Object.keys(plan).forEach(day => {
      if (plan[day].exercises) {
        plan[day].exercises += `, Core Plank (3 sets x 90s)`;
      }
    });
  }

  return plan;
}
