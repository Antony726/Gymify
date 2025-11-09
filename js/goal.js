import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

let chart;
let user = null;

// 🔵 Chart rendering
function renderChart(progress) {
  const ctx = document.getElementById("goalChart").getContext("2d");
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "doughnut",
    data: {
      datasets: [{
        data: [progress, 100 - progress],
        backgroundColor: ["#66fcf1", "#1f2833"],
        borderWidth: 0
      }]
    },
    options: {
      cutout: "70%",
      plugins: { legend: { display: false } }
    }
  });
}

// 🧠 Update chart + UI
function updateUI(goalName, current, target, deadline) {
  const progress = Math.min((current / target) * 100, 100).toFixed(1);
  document.getElementById("goalLabel").textContent = `${progress}%`;
  document.getElementById("progressText").textContent =
    `${goalName}: ${current}kg / ${target}kg`;

  renderChart(progress);
  startCountdown(deadline);
}

// ⏳ Countdown Timer
function startCountdown(deadline) {
  const timerText = document.getElementById("timerText");
  const interval = setInterval(() => {
    const now = new Date().getTime();
    const diff = deadline - now;

    if (diff <= 0) {
      timerText.textContent = "🎉 Goal period ended!";
      clearInterval(interval);
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    timerText.textContent = `⏳ ${days}d ${hours}h left to achieve your goal!`;
  }, 1000);
}

// 🏋️ Get user's best PR for a given workout
async function getCurrentPR(user, workoutName) {
  const logsRef = collection(db, "users", user.uid, "logs");
  const snapshot = await getDocs(logsRef);

  let best = 0;
  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    if (data.workout && data.sets) {
      const exercise = data.workout.toLowerCase();
      if (exercise.includes(workoutName.toLowerCase())) {
        const max = Math.max(...data.sets.map(s => s.weight || 0));
        if (max > best) best = max;
      }
    }
  });

  return best;
}

// 🎯 Load user's saved workouts from plan
// 🎯 Load user's workouts from the same structure used in log.js
async function loadWorkoutOptions(user) {
  const workoutSelect = document.getElementById("workoutSelect");
  workoutSelect.innerHTML = "<option value=''>Loading workouts...</option>";

  const planRef = doc(db, "users", user.uid, "data", "plan");
  const planSnap = await getDoc(planRef);

  workoutSelect.innerHTML = "<option value=''>Select workout...</option>";

  if (!planSnap.exists()) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "⚠️ No workout plan found";
    workoutSelect.appendChild(opt);
    return;
  }

  const plan = planSnap.data();
  const todayName = new Date().toLocaleDateString("en-US", { weekday: "long" });

  const todayWorkouts = [];
  const otherWorkouts = [];

  // Extract workouts by day
  for (const day in plan) {
    const workoutType = plan[day]?.type;
    const exercises = plan[day]?.exercises?.split(",") || [];

    exercises.forEach((exercise) => {
      const value = `${workoutType} - ${exercise.trim()}`;
      const display = `${day} - ${exercise.trim()}`;

      if (day === todayName) todayWorkouts.push({ value, display });
      else otherWorkouts.push({ value, display });
    });
  }

  const allWorkouts = [...todayWorkouts, ...otherWorkouts];

  if (allWorkouts.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No workouts found in plan.";
    workoutSelect.appendChild(opt);
    return;
  }

  allWorkouts.forEach((w) => {
    const opt = document.createElement("option");
    opt.value = w.value;
    opt.textContent = w.display;
    workoutSelect.appendChild(opt);
  });
}


// 🚀 Main logic
onAuthStateChanged(auth, async (u) => {
  if (!u) return (window.location.href = "login.html");
  user = u;

  await loadWorkoutOptions(user);

  const goalRef = doc(db, "users", user.uid, "goals", "main");
  const goalSnap = await getDoc(goalRef);

  if (goalSnap.exists()) {
    const { goalName, targetValue, currentValue, deadline } = goalSnap.data();
    updateUI(goalName, currentValue, targetValue, deadline);
  }
});

document.getElementById("workoutSelect").addEventListener("change", async (e) => {
  const workout = e.target.value;
  if (!workout) return;
  const currentPR = await getCurrentPR(user, workout);
  document.getElementById("currentValue").value = currentPR || 0;
});
// 📝 Set new goal
document.getElementById("setGoal").addEventListener("click", async () => {
  const workoutName = document.getElementById("workoutSelect").value;
  const target = parseFloat(document.getElementById("targetValue").value);
  const days = parseInt(document.getElementById("goalDays").value);

  if (!workoutName || !target || !days) return alert("Please fill all fields!");

  const current = await getCurrentPR(user, workoutName);
  const deadline = new Date().getTime() + days * 24 * 60 * 60 * 1000;

  const goalRef = doc(db, "users", user.uid, "goals", "main");
  await setDoc(goalRef, {
    goalName: workoutName,
    targetValue: target,
    currentValue: current,
    deadline
  });

  updateUI(workoutName, current, target, deadline);
});
