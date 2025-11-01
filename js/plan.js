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