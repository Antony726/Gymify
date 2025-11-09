import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const container = document.getElementById("days-container");
const form = document.getElementById("plan-form");
const statusMsg = document.getElementById("status");
const backBtn = document.getElementById("back-btn");

let userId = null;

// Build dynamic form for each day
days.forEach(day => {
  const div = document.createElement("div");
  div.classList.add("day");
  div.innerHTML = `
    <h3>${day}</h3>
    <label>Workout Type:</label>
    <select name="${day}-type">
      <option>Upper</option>
      <option>Lower</option>
      <option>Push</option>
      <option>Pull</option>
      <option>Legs</option>
      <option>Core</option>
      <option>Cardio</option>
      <option>Rest</option>
    </select>
    <label>Exercises (comma separated)</label>
    <textarea name="${day}-exercises" placeholder="Bench Press, Dips, Push-ups"></textarea>
  `;
  container.appendChild(div);
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  userId = user.uid;
  const planRef = doc(db, "users", userId, "data", "plan");

  try {
    const planSnap = await getDoc(planRef);
    if (planSnap.exists()) {
      const plan = planSnap.data();
      days.forEach(day => {
        const typeSelect = document.querySelector(`[name='${day}-type']`);
        const exercisesTextarea = document.querySelector(`[name='${day}-exercises']`);
        
        if (typeSelect && plan[day]?.type) {
          typeSelect.value = plan[day].type;
        }
        if (exercisesTextarea && plan[day]?.exercises) {
          exercisesTextarea.value = plan[day].exercises;
        }
      });
    }
  } catch (err) {
    console.error("🔥 Error loading plan:", err);
    statusMsg.textContent = "⚠️ Failed to load plan. Check permissions.";
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!userId) {
    statusMsg.textContent = "❌ User not logged in!";
    return;
  }

  const plan = {};
  days.forEach(day => {
    const typeSelect = document.querySelector(`[name='${day}-type']`);
    const exercisesTextarea = document.querySelector(`[name='${day}-exercises']`);
    
    plan[day] = {
      type: typeSelect?.value || "Rest",
      exercises: exercisesTextarea?.value || ""
    };
  });

  const planRef = doc(db, "users", userId, "data", "plan");

  try {
    await setDoc(planRef, plan);
    statusMsg.textContent = "✅ Plan saved successfully!";
    statusMsg.style.color = "green";
  } catch (err) {
    console.error("🔥 Error saving plan:", err);
    statusMsg.textContent = `❌ Failed to save plan: ${err.message}`;
    statusMsg.style.color = "red";
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
    statusMsg.textContent = "❌ Please log in first.";
    return;
  }

  const planRef = doc(db, "users", userId, "data", "plan");

  try {
    const planSnap = await getDoc(planRef);
    if (!planSnap.exists()) {
      statusMsg.textContent = "⚠️ No plan found to export.";
      return;
    }

    const plan = planSnap.data();
    const encodedPlan = btoa(JSON.stringify(plan)); // Base64 encode

    // Copy to clipboard
    await navigator.clipboard.writeText(encodedPlan);

    statusMsg.innerHTML = "✅ Plan copied to clipboard! You can share this code.";
    statusMsg.style.color = "#00e676";
  } catch (err) {
    console.error("Export failed:", err);
    statusMsg.textContent = "❌ Failed to export plan.";
    statusMsg.style.color = "red";
  }
});

// 📥 IMPORT PLAN
importBtn.addEventListener("click", async () => {
  const code = importBox.value.trim();

  if (!code) {
    statusMsg.textContent = "⚠️ Please paste a valid plan code.";
    return;
  }

  if (!userId) {
    statusMsg.textContent = "❌ Please log in first.";
    return;
  }

  try {
    const decodedPlan = JSON.parse(atob(code)); // decode Base64 → JSON

    const planRef = doc(db, "users", userId, "data", "plan");
    await setDoc(planRef, decodedPlan);

    // update UI immediately
    days.forEach(day => {
      const typeSelect = document.querySelector(`[name='${day}-type']`);
      const exercisesTextarea = document.querySelector(`[name='${day}-exercises']`);

      if (decodedPlan[day]) {
        typeSelect.value = decodedPlan[day].type || "Rest";
        exercisesTextarea.value = decodedPlan[day].exercises || "";
      }
    });

    statusMsg.textContent = "✅ Plan imported successfully!";
    statusMsg.style.color = "#00e676";
  } catch (err) {
    console.error("Import failed:", err);
    statusMsg.textContent = "❌ Invalid or corrupted plan code!";
    statusMsg.style.color = "red";
  }
});
