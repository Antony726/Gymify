import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, collection, addDoc, getDocs, deleteDoc, query, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";
import { enhanceAllSelects } from "./custom-dropdown.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// State Variables
let userUID = null;
let calorieTarget = 2000;
let todayLoggedFoods = [];
let todayTotalCalories = 0;

// DOM Elements
const dietSetupForm = document.getElementById("dietSetupForm");
const resultsPanel = document.getElementById("resultsPanel");
const loggingPanel = document.getElementById("loggingPanel");
const historyPanel = document.getElementById("historyPanel");

// Inputs
const dietHeightInput = document.getElementById("dietHeight");
const dietWeightInput = document.getElementById("dietWeight");
const dietAgeInput = document.getElementById("dietAge");
const dietGenderInput = document.getElementById("dietGender");
const dietActivityInput = document.getElementById("dietActivity");
const dietGoalInput = document.getElementById("dietGoal");
const dietTargetWeightInput = document.getElementById("dietTargetWeight");
const dietTimeframeInput = document.getElementById("dietTimeframe");
const dietGoalWarning = document.getElementById("dietGoalWarning");

// Display Elements
const bmiValEl = document.getElementById("bmiVal");
const bmiCategoryEl = document.getElementById("bmiCategory");
const tdeeValEl = document.getElementById("tdeeVal");
const targetCalValEl = document.getElementById("targetCalVal");


// Logger Elements
const addFoodForm = document.getElementById("addFoodForm");
const foodNameInput = document.getElementById("foodName");
const foodCaloriesInput = document.getElementById("foodCalories");
const foodProteinInput = document.getElementById("foodProtein");
const foodListEl = document.getElementById("foodList");
const intakeEatenEl = document.getElementById("intakeEaten");
const intakeTargetEl = document.getElementById("intakeTarget");
const intakeProgressFill = document.getElementById("intakeProgressFill");
const intakeStateMsg = document.getElementById("intakeStateMsg");
const historyListEl = document.getElementById("historyList");

// Helper: Get local YYYY-MM-DD date string
function getLocalDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Watch inputs to validate timelines safely
function validateTimeframeRate() {
  const currentW = parseFloat(dietWeightInput.value);
  const targetW = parseFloat(dietTargetWeightInput.value);
  const weeks = parseInt(dietTimeframeInput.value);

  if (isNaN(currentW) || isNaN(targetW) || isNaN(weeks) || currentW <= 0 || targetW <= 0 || weeks <= 0) {
    dietGoalWarning.style.display = "none";
    return;
  }

  const weightChange = Math.abs(targetW - currentW);
  const rate = weightChange / weeks;

  if (rate > 1.0) {
    dietGoalWarning.style.display = "flex";
    dietGoalWarning.innerHTML = `⚠️ <b>Weight rate alert:</b> Changing from ${currentW} kg to ${targetW} kg (${weightChange.toFixed(1)} kg diff) in ${weeks} weeks equates to <b>${rate.toFixed(2)} kg/week</b>. For health and sustainability, we highly recommend a maximum rate of <b>1.0 kg/week</b>. Consider setting a timeframe of at least <b>${Math.ceil(weightChange)} weeks</b>.`;
  } else {
    dietGoalWarning.style.display = "none";
  }
}

dietWeightInput.addEventListener("input", validateTimeframeRate);
dietTargetWeightInput.addEventListener("input", validateTimeframeRate);
dietTimeframeInput.addEventListener("input", validateTimeframeRate);

function updateDietPreview() {
  const height = parseFloat(dietHeightInput.value);
  const weight = parseFloat(dietWeightInput.value);
  const age = parseInt(dietAgeInput.value);
  const gender = dietGenderInput.value;
  const activityFactor = parseFloat(dietActivityInput.value);
  const goal = dietGoalInput.value;

  if (isNaN(height) || isNaN(weight) || isNaN(age) || height <= 0 || weight <= 0 || age <= 0) {
    return;
  }

  const metrics = calculateNutrition(height, weight, age, gender, activityFactor, goal);
  renderDashboardMetrics(metrics);
  validateTimeframeRate();
}

dietHeightInput.addEventListener("input", updateDietPreview);
dietWeightInput.addEventListener("input", updateDietPreview);
dietAgeInput.addEventListener("input", updateDietPreview);
dietGenderInput.addEventListener("change", updateDietPreview);
dietActivityInput.addEventListener("change", updateDietPreview);
dietGoalInput.addEventListener("change", updateDietPreview);

// Compute body metrics & macros
function calculateNutrition(height, weight, age, gender, activityFactor, goal) {
  // 1. BMI calculation
  const heightM = height / 100;
  const bmi = weight / (heightM * heightM);
  
  let bmiCategory = "Normal weight";
  if (bmi < 18.5) bmiCategory = "Underweight";
  else if (bmi >= 25 && bmi < 30) bmiCategory = "Overweight";
  else if (bmi >= 30) bmiCategory = "Obese";

  // 2. BMR (Mifflin-St Jeor)
  let bmr = 0;
  if (gender === "male") {
    bmr = 10 * weight + 6.25 * height - 5 * age + 5;
  } else {
    bmr = 10 * weight + 6.25 * height - 5 * age - 161;
  }

  // 3. TDEE
  const tdee = bmr * activityFactor;

  // 4. Target Calories
  let target = tdee;
  if (goal === "cut") {
    target = tdee - 500;
  } else if (goal === "bulk") {
    target = tdee + 300;
  }

  // Round results
  const targetCalories = Math.max(1200, Math.round(target)); // floor at 1200kcal for safety

  // 5. Target Macronutrients (30% Protein, 45% Carbs, 25% Fats)
  const proteinG = Math.round((targetCalories * 0.30) / 4);
  const carbsG = Math.round((targetCalories * 0.45) / 4);
  const fatsG = Math.round((targetCalories * 0.25) / 9);

  return {
    bmi: bmi.toFixed(1),
    bmiCategory,
    tdee: Math.round(tdee),
    targetCalories,
    proteinG,
    carbsG,
    fatsG
  };
}

// Render Results Dashboard
function renderDashboardMetrics(metrics) {
  bmiValEl.textContent = metrics.bmi;
  bmiCategoryEl.textContent = metrics.bmiCategory;
  tdeeValEl.textContent = metrics.tdee;
  targetCalValEl.textContent = metrics.targetCalories;

  // Update slider variables
  calorieTarget = metrics.targetCalories;
  intakeTargetEl.textContent = calorieTarget;

  resultsPanel.style.display = "block";
  loggingPanel.style.display = "block";
}

// Render Food Items Logged Today
function renderTodayFoods() {
  foodListEl.innerHTML = "";
  todayTotalCalories = 0;
  let todayTotalProtein = 0;

  if (todayLoggedFoods.length === 0) {
    foodListEl.innerHTML = `<p style="font-size:11px; color:var(--text-secondary); text-align:center; padding: 10px 0;">No foods logged today yet.</p>`;
  } else {
    todayLoggedFoods.forEach(food => {
      todayTotalCalories += food.calories;
      if (food.protein) todayTotalProtein += food.protein;

      const div = document.createElement("div");
      div.className = "food-item";
      div.innerHTML = `
        <div>
          <span class="name">${food.name}</span><br>
          <span class="details">🔥 ${food.calories} kcal ${food.protein ? `· 🥩 ${food.protein}g protein` : ""}</span>
        </div>
        <button type="button" class="del-food-btn" data-id="${food.id}">✕</button>
      `;

      div.querySelector(".del-food-btn").addEventListener("click", async () => {
        if (confirm(`Remove "${food.name}" from your intake logs?`)) {
          await deleteFoodLog(food.id);
        }
      });

      foodListEl.appendChild(div);
    });
  }

  // Update budget values
  intakeEatenEl.textContent = todayTotalCalories;
  const progressPercent = Math.min(100, (todayTotalCalories / calorieTarget) * 100);
  intakeProgressFill.style.width = `${progressPercent}%`;

  if (todayTotalCalories <= calorieTarget) {
    intakeProgressFill.style.background = "linear-gradient(90deg, var(--color-accent), var(--color-success))";
    const remaining = calorieTarget - todayTotalCalories;
    intakeStateMsg.innerHTML = `Under budget. You have <b>${remaining} kcal</b> remaining today!`;
  } else {
    intakeProgressFill.style.background = "linear-gradient(90deg, var(--color-warning), var(--color-danger))";
    const over = todayTotalCalories - calorieTarget;
    intakeStateMsg.innerHTML = `<span style="color:var(--color-danger);font-weight:700;">Over budget by ${over} kcal!</span>`;
  }
}

// Delete food log doc
async function deleteFoodLog(docId) {
  if (!userUID) return;
  if (window.GymifyLoader) window.GymifyLoader.show("Removing food log...");
  try {
    const docRef = doc(db, "users", userUID, "dietLogs", docId);
    await deleteDoc(docRef);
    
    // Remove locally
    todayLoggedFoods = todayLoggedFoods.filter(f => f.id !== docId);
    renderTodayFoods();
    await updateHistoricalSummary();
  } catch (err) {
    console.error("Error deleting log:", err);
  } finally {
    if (window.GymifyLoader) window.GymifyLoader.hide();
  }
}

// Add Food Submit handler
addFoodForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!userUID) return;

  const name = foodNameInput.value.trim();
  const calories = parseInt(foodCaloriesInput.value);
  const protein = parseInt(foodProteinInput.value) || 0;

  const logDate = getLocalDateString();

  if (window.GymifyLoader) window.GymifyLoader.show("Logging food item...");

  try {
    const payload = {
      name,
      calories,
      protein,
      date: logDate,
      timestamp: new Date().toISOString()
    };

    const docRef = await addDoc(collection(db, "users", userUID, "dietLogs"), payload);
    
    todayLoggedFoods.push({ id: docRef.id, ...payload });
    renderTodayFoods();

    // Reset inputs
    foodNameInput.value = "";
    foodCaloriesInput.value = "";
    foodProteinInput.value = "";
    
    if (window.showToast) window.showToast("✅ Food Logged Successfully!", "success");

    await updateHistoricalSummary();
  } catch (err) {
    console.error("Error adding food:", err);
    if (window.showToast) window.showToast("❌ Failed to log food.", "error");
  } finally {
    if (window.GymifyLoader) window.GymifyLoader.hide();
  }
});

// Update Historical Log displays
async function updateHistoricalSummary() {
  if (!userUID) return;
  try {
    const logsRef = collection(db, "users", userUID, "dietLogs");
    const q = query(logsRef, orderBy("timestamp", "desc"));
    const snap = await getDocs(q);

    // Group by Date
    const dailyTotals = {};
    snap.forEach(docSnap => {
      const log = docSnap.data();
      if (log.date) {
        if (!dailyTotals[log.date]) {
          dailyTotals[log.date] = { calories: 0, protein: 0 };
        }
        dailyTotals[log.date].calories += log.calories || 0;
        dailyTotals[log.date].protein += log.protein || 0;
      }
    });

    historyListEl.innerHTML = "";
    const dates = Object.keys(dailyTotals).sort((a,b) => b.localeCompare(a)).slice(0, 7);

    if (dates.length === 0) {
      historyListEl.innerHTML = `<p style="font-size:11px; color:var(--text-secondary); text-align:center; padding:10px 0;">No history available.</p>`;
      historyPanel.style.display = "none";
    } else {
      historyPanel.style.display = "block";
      dates.forEach(date => {
        const item = dailyTotals[date];
        const displayDate = new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short" });
        const isOver = item.calories > calorieTarget;

        const row = document.createElement("div");
        row.style.cssText = `
          display: flex;
          justify-content: space-between;
          padding: 8px 12px;
          background: rgba(255,255,255,0.01);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          font-size: 12px;
        `;
        row.innerHTML = `
          <span style="font-weight:600; color:#fff;">${displayDate}</span>
          <span style="font-weight:700; color:${isOver ? 'var(--color-danger)' : 'var(--color-success)'}">
            ${item.calories} / ${calorieTarget} kcal ${item.protein ? `(🥩 ${item.protein}g)` : ""}
          </span>
        `;
        historyListEl.appendChild(row);
      });
    }
  } catch (err) {
    console.error("Error loading diet history:", err);
  }
}

// Fetch diet settings & today's logs
async function loadDietDashboard() {
  if (!userUID) return;

  const dietRef = doc(db, "users", userUID, "data", "diet");
  
  try {
    const snap = await getDoc(dietRef);
    if (snap.exists()) {
      const data = snap.data();
      dietHeightInput.value = data.height || "";
      dietWeightInput.value = data.weight || "";
      dietAgeInput.value = data.age || "";
      dietGenderInput.value = data.gender || "male";
      dietActivityInput.value = data.activityFactor || "1.2";
      dietGoalInput.value = data.goal || "maintain";
      dietTargetWeightInput.value = data.targetWeight !== undefined ? data.targetWeight : (data.targetWeightChange || "");
      dietTimeframeInput.value = data.targetTimeframe || "";

      // Compute & Render
      const metrics = calculateNutrition(
        data.height,
        data.weight,
        data.age,
        data.gender,
        parseFloat(data.activityFactor),
        data.goal
      );
      renderDashboardMetrics(metrics);
      validateTimeframeRate();
    }
    
    // Fetch today's food logs
    const todayStr = getLocalDateString();
    const logsRef = collection(db, "users", userUID, "dietLogs");
    const q = query(logsRef, orderBy("timestamp", "asc"));
    const logsSnap = await getDocs(q);

    todayLoggedFoods = [];
    logsSnap.forEach(docSnap => {
      const log = docSnap.data();
      if (log.date === todayStr) {
        todayLoggedFoods.push({ id: docSnap.id, ...log });
      }
    });

    renderTodayFoods();
    await updateHistoricalSummary();

  } catch (err) {
    console.error("Error loading diet settings:", err);
  }
}

// Diet Setup Form submit
dietSetupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!userUID) return;

  const height = parseFloat(dietHeightInput.value);
  const weight = parseFloat(dietWeightInput.value);
  const age = parseInt(dietAgeInput.value);
  const gender = dietGenderInput.value;
  const activityFactor = parseFloat(dietActivityInput.value);
  const goal = dietGoalInput.value;
  const currentW = parseFloat(dietWeightInput.value) || 0;
  const targetW = parseFloat(dietTargetWeightInput.value) || 0;
  const targetWeightChange = Math.abs(targetW - currentW);
  const targetTimeframe = parseInt(dietTimeframeInput.value) || 0;

  if (window.GymifyLoader) window.GymifyLoader.show("Saving body settings...");

  try {
    const metrics = calculateNutrition(height, weight, age, gender, activityFactor, goal);

    const payload = {
      height,
      weight,
      age,
      gender,
      activityFactor,
      goal,
      targetWeight: targetW,
      targetWeightChange,
      targetTimeframe,
      calorieTarget: metrics.targetCalories,
      updatedAt: new Date().toISOString()
    };

    await setDoc(doc(db, "users", userUID, "data", "diet"), payload);

    renderDashboardMetrics(metrics);
    validateTimeframeRate();

    if (window.showToast) window.showToast("✅ Diet settings saved successfully!", "success");
    else alert("✅ Diet settings saved successfully!");

    await updateHistoricalSummary();
  } catch (err) {
    console.error("Error saving diet setup:", err);
    if (window.showToast) window.showToast("❌ Could not save settings.", "error");
  } finally {
    if (window.GymifyLoader) window.GymifyLoader.hide();
  }
});

// Auth Listener
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  userUID = user.uid;

  enhanceAllSelects();

  if (window.GymifyLoader) window.GymifyLoader.show("Loading diet history...");
  await loadDietDashboard();
  if (window.GymifyLoader) window.GymifyLoader.hide();
});
