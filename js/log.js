import { auth, db } from "./firebase-config.js";
import {
  collection,
  addDoc,
  getDoc,
  doc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

const workoutSelect = document.getElementById("workout-select");
const logForm = document.getElementById("log-form");
const statusDiv = document.getElementById("status");
const backBtn = document.getElementById("back-btn");
const dateInput = document.getElementById("date");

// 🗓️ Auto-fill today's date
const todayISO = new Date().toISOString().split("T")[0];
dateInput.value = todayISO;

// 🔙 Back to Dashboard
backBtn.addEventListener("click", () => (window.location.href = "dashboard.html"));

// 🔐 Auth listener
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  // 🏋️ Load user's plan
  const planRef = doc(db, "users", user.uid, "data", "plan");
  const planSnap = await getDoc(planRef);

  if (planSnap.exists()) {
    const plan = planSnap.data();
    for (const day in plan) {
      const workoutType = plan[day]?.type;
      const exercises = plan[day]?.exercises?.split(",") || [];

      exercises.forEach((exercise) => {
        const opt = document.createElement("option");
        opt.value = `${workoutType} - ${exercise.trim()}`;
        opt.textContent = `${day} - ${exercise.trim()}`;
        workoutSelect.appendChild(opt);
      });
    }
  } else {
    statusDiv.textContent = "⚠️ No workout plan found. Please create one first.";
  }
});

// 🧾 Handle workout logging
logForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const user = auth.currentUser;
  if (!user) return alert("Please sign in first!");

  const selectedWorkout = workoutSelect.value;
  const date = dateInput.value;
  const notes = document.getElementById("notes").value;

  const sets = [
    {
      set: 1,
      reps: parseInt(document.getElementById("set1-reps").value),
      weight: parseFloat(document.getElementById("set1-weight").value),
    },
    {
      set: 2,
      reps: parseInt(document.getElementById("set2-reps").value),
      weight: parseFloat(document.getElementById("set2-weight").value),
    },
    {
      set: 3,
      reps: parseInt(document.getElementById("set3-reps").value),
      weight: parseFloat(document.getElementById("set3-weight").value),
    },
  ];

  try {
    // 💾 Add workout log
    await addDoc(collection(db, "users", user.uid, "logs"), {
      workout: selectedWorkout,
      date,
      sets,
      notes,
      timestamp: new Date(),
    });

    // ⭐ XP + 🔥 Streak update
    const statsRef = doc(db, "users", user.uid, "data", "stats");
    const statsSnap = await getDoc(statsRef);

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    let xp = 0;
    let streak = 1;

    // 🧮 XP calculation: base + per weight
    sets.forEach((s) => {
      xp += 5 + Math.floor(s.weight / 5);
    });

    if (statsSnap.exists()) {
      const data = statsSnap.data();
      xp += data.xp || 0;

      const lastLogDate = new Date(data.lastLogDate);
      const diffDays = (today - lastLogDate) / (1000 * 60 * 60 * 24);

      if (diffDays < 1) {
        // ✅ Already logged today — don’t double-increment streak
        streak = data.streak || 1;
      } else if (diffDays <= 1.5) {
        // ✅ Within 24–36 hours → continue streak
        streak = (data.streak || 0) + 1;
      } else {
        // ❌ Missed more than a day → reset streak
        streak = 1;
      }
    }

    await setDoc(statsRef, {
      xp,
      streak,
      lastLogDate: todayStr,
      lastWorkoutWasRest: selectedWorkout.toLowerCase().includes("rest"),
    });

    statusDiv.textContent = "✅ Workout logged and XP updated!";
    statusDiv.style.color = "green";
    logForm.reset();
    dateInput.value = todayISO;

    // 🟢 Tell dashboard to refresh workout section
    localStorage.setItem("refreshDashboardWorkout", "true");

    // 🔁 Redirect to dashboard
    setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 1500);


  } catch (err) {
    console.error("🔥 Error logging workout:", err);
    statusDiv.textContent = "❌ Error logging workout.";
    statusDiv.style.color = "red";
  }
});
