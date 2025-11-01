import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  serverTimestamp,
  query,
  orderBy,
  limit,
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// 🔥 Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 🧱 UI Elements
const usernameEl = document.getElementById("username");
const logoutBtn = document.getElementById("logout-btn");
const workoutSplitEl = document.getElementById("workout-split");
const questEl = document.getElementById("daily-quest");
const quoteEl = document.getElementById("coach-quote");
const xpEl = document.getElementById("xp-display");
const streakEl = document.getElementById("streak-display");
const gymifyLevelEl = document.getElementById("gymify-level");

// 🧠 Random Quests + Quotes
const quests = [
  "Run 2 km today",
  "Do 3 sets of planks",
  "Stretch for 10 minutes",
  "Drink 3 litres of water",
  "Perform 100 squats",
  "Take a cold shower post-workout",
];
const quotes = [
  "No pain, no gain – but no rest, no growth either.",
  "Show up today for a stronger you tomorrow.",
  "Discipline beats motivation every time.",
  "If it doesn’t challenge you, it won’t change you.",
  "Small progress is still progress!",
];

// 🏅 XP → Level Mapping
function getLevelFromXP(xp) {
  if (xp >= 500) return { tier: "Platinum", icon: "💎", min: 500 };
  if (xp >= 250) return { tier: "Gold", icon: "🥇", min: 250 };
  if (xp >= 100) return { tier: "Silver", icon: "🥈", min: 100 };
  return { tier: "Bronze", icon: "🥉", min: 0 };
}

// 📈 Level progress %
function getLevelProgress(xp) {
  const level = getLevelFromXP(xp);
  const nextMin =
    level.min === 0 ? 100 :
    level.min === 100 ? 250 :
    level.min === 250 ? 500 : level.min;
  return Math.min(100, Math.round(((xp - level.min) / (nextMin - level.min)) * 100));
}

// 💡 Next Workout (show 1 at a time)
async function loadNextWorkout(user) {
  const nextDiv = document.getElementById("next-workout");

  try {
    const planRef = doc(db, "users", user.uid, "data", "plan");
    const planSnap = await getDoc(planRef);
    if (!planSnap.exists()) {
      nextDiv.textContent = "⚠️ No workout plan found. Create one first.";
      return;
    }

    const plan = planSnap.data();
    const planDays = Object.keys(plan);
    if (planDays.length === 0) {
      nextDiv.textContent = "No workouts in your plan.";
      return;
    }

    // Get last logged workout
    const logsRef = collection(db, "users", user.uid, "logs");
    const q = query(logsRef, orderBy("timestamp", "desc"), limit(1));
    const snapshot = await getDocs(q);

    let nextWorkout = null;
    let nextDayName = null;

    if (snapshot.empty) {
      // No log yet → show first exercise of first day
      const firstDay = planDays[0];
      const firstExercises = plan[firstDay]?.exercises?.split(",").map(e => e.trim()) || [];
      nextWorkout = firstExercises[0] || "Start your first workout!";
      nextDayName = firstDay;
    } else {
      const lastLog = snapshot.docs[0].data();
      const lastExercise = lastLog.exerciseName || "";

      // Find last exercise position in plan
      for (let i = 0; i < planDays.length; i++) {
        const day = planDays[i];
        const exercises = plan[day]?.exercises?.split(",").map(e => e.trim()) || [];
        if (exercises.includes(lastExercise)) {
          const nextIndex = exercises.indexOf(lastExercise) + 1;
          if (nextIndex < exercises.length) {
            nextWorkout = exercises[nextIndex];
            nextDayName = day;
          } else {
            // Move to next day
            const nextDay = planDays[(i + 1) % planDays.length];
            const nextExercises = plan[nextDay]?.exercises?.split(",").map(e => e.trim()) || [];
            nextWorkout = nextExercises[0];
            nextDayName = nextDay;
          }
          break;
        }
      }

      // Fallback if not found
      if (!nextWorkout) {
        const firstDay = planDays[0];
        const firstExercises = plan[firstDay]?.exercises?.split(",").map(e => e.trim()) || [];
        nextWorkout = firstExercises[0];
        nextDayName = firstDay;
      }
    }

    nextDiv.innerHTML = `<b>${nextDayName}</b>: ${nextWorkout}`;
  } catch (err) {
    console.error("Error loading next workout:", err);
    nextDiv.textContent = "❌ Error loading next workout.";
  }
}

// 👀 Auth State
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  usernameEl.textContent = user.displayName || user.email;

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  // ✅ Fetch today’s workout plan
  const planRef = doc(db, "users", user.uid, "data", "plan");
  const planSnap = await getDoc(planRef);
  let todayIsRestDay = false;

  if (planSnap.exists()) {
    const plan = planSnap.data();
    const todayName = today.toLocaleDateString("en-US", { weekday: "long" });
    const todayPlan = plan[todayName];
    if (todayPlan?.type === "Rest") {
      workoutSplitEl.textContent = "Rest Day 💤";
      todayIsRestDay = true;
    } else {
      workoutSplitEl.textContent = `${todayPlan?.type || "No plan"} – ${todayPlan?.exercises || ""}`;
    }
  } else {
    workoutSplitEl.textContent = "No workout plan found. Go create one 💪";
  }

  // ✅ Load XP + streak
  try {
    const statsRef = doc(db, "users", user.uid, "data", "stats");
    const statsSnap = await getDoc(statsRef);

    let xp = 0;
    let streak = 0;
    let lastWorkoutDate = null;
    if (statsSnap.exists()) ({ xp, streak, lastWorkoutDate } = statsSnap.data());

    const logsRef = collection(db, "users", user.uid, "logs");
    const logsSnap = await getDocs(logsRef);
    const logDates = new Set();
    logsSnap.forEach((log) => {
      const data = log.data();
      if (data.date) logDates.add(data.date);
    });

    const hasWorkedOutToday = logDates.has(todayStr);

    if (todayIsRestDay) {
      // rest day → keep streak
    } else if (hasWorkedOutToday && lastWorkoutDate !== todayStr) {
      if (lastWorkoutDate === yesterdayStr) streak += 1;
      else streak = 1;
      xp += 10;
      lastWorkoutDate = todayStr;
    } else if (!hasWorkedOutToday && lastWorkoutDate !== yesterdayStr && !todayIsRestDay) {
      streak = 0;
    }

    await setDoc(statsRef, { xp, streak, lastWorkoutDate, updatedAt: serverTimestamp() });

    xpEl.textContent = `⭐ XP: ${xp}`;
    streakEl.textContent = `🔥 Streak: ${streak} days`;

    const level = getLevelFromXP(xp);
    gymifyLevelEl.textContent = `${level.icon} ${level.tier}`;

    const progress = getLevelProgress(xp);
    const xpBar = document.getElementById("xp-bar");
    if (xpBar) xpBar.style.width = `${progress}%`;
  } catch (err) {
    console.error("⚠️ Error updating XP/streak:", err);
  }

  // 🧠 Daily Quest + Quote
  questEl.textContent = quests[Math.floor(Math.random() * quests.length)];
  quoteEl.textContent = quotes[Math.floor(Math.random() * quotes.length)];

  // 💡 Load Next Workout
  loadNextWorkout(user);
});

// 🚪 Logout
logoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "login.html";
});
