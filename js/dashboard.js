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
const questBtn = document.getElementById("complete-quest");
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

// 💪 Next workout loader
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

    const logsRef = collection(db, "users", user.uid, "logs");
    const q = query(logsRef, orderBy("timestamp", "desc"), limit(1));
    const snapshot = await getDocs(q);

    let nextWorkout, nextDayName;
    if (snapshot.empty) {
      const firstDay = planDays[0];
      const exercises = plan[firstDay]?.exercises?.split(",").map(e => e.trim()) || [];
      nextWorkout = exercises[0] || "Start your first workout!";
      nextDayName = firstDay;
    } else {
      const lastLog = snapshot.docs[0].data();
      const lastExercise = lastLog.exerciseName || "";

      for (let i = 0; i < planDays.length; i++) {
        const day = planDays[i];
        const exercises = plan[day]?.exercises?.split(",").map(e => e.trim()) || [];
        if (exercises.includes(lastExercise)) {
          const nextIndex = exercises.indexOf(lastExercise) + 1;
          if (nextIndex < exercises.length) {
            nextWorkout = exercises[nextIndex];
            nextDayName = day;
          } else {
            const nextDay = planDays[(i + 1) % planDays.length];
            const nextExercises = plan[nextDay]?.exercises?.split(",").map(e => e.trim()) || [];
            nextWorkout = nextExercises[0];
            nextDayName = nextDay;
          }
          break;
        }
      }
    }

    nextDiv.innerHTML = `<b>${nextDayName}</b>: ${nextWorkout}`;
  } catch (err) {
    console.error("Error loading next workout:", err);
    nextDiv.textContent = "❌ Error loading next workout.";
  }
}

// 🧩 Daily Quest loader
async function loadDailyQuest(user) {
  const today = new Date().toISOString().split("T")[0];
  const questRef = doc(db, "users", user.uid, "data", "dailyQuest");
  const questSnap = await getDoc(questRef);

  let questData;
  if (questSnap.exists()) {
    questData = questSnap.data();
    if (questData.date === today) {
      questEl.textContent = questData.text;
      quoteEl.textContent = `"${questData.quote}"`;
      if (questData.completed) {
        questBtn.disabled = true;
        questBtn.textContent = "✅ Quest Completed";
      }
      return;
    }
  }

  // New daily quest
  const randomQuest = quests[Math.floor(Math.random() * quests.length)];
  const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
  const isSpecial = Math.random() < 0.2;
  const questText = isSpecial ? `🌟 SPECIAL QUEST: ${randomQuest}` : randomQuest;

  questData = {
    text: questText,
    quote: randomQuote,
    date: today,
    isSpecial,
    completed: false,
  };
  await setDoc(questRef, questData);

  questEl.textContent = questText;
  quoteEl.textContent = `"${randomQuote}"`;
}

// 🧠 Quest Completion
questBtn?.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) return;

  const questRef = doc(db, "users", user.uid, "data", "dailyQuest");
  const questSnap = await getDoc(questRef);
  if (!questSnap.exists()) return alert("No quest found for today.");

  const quest = questSnap.data();
  if (quest.completed) return alert("🎯 You already completed today's quest!");

  const statsRef = doc(db, "users", user.uid, "data", "stats");
  const statsSnap = await getDoc(statsRef);
  if (!statsSnap.exists()) return alert("No stats found yet.");

  let { xp = 0, hearts = 4 } = statsSnap.data();
  const xpGain = quest.isSpecial ? 20 : 10;

  if (quest.isSpecial && hearts < 4) {
    hearts += 1;
    alert("🌟 Special Quest Complete! +1 ❤️ and +20 XP!");
  } else if (quest.isSpecial) {
    alert("🌟 Special Quest Complete! ❤️ Full, +20 XP!");
  } else {
    alert("🎯 Quest Completed! +10 XP!");
  }

  xp += xpGain;

  await setDoc(statsRef, { ...statsSnap.data(), xp, hearts, updatedAt: serverTimestamp() });
  await setDoc(questRef, { ...quest, completed: true });

  xpEl.textContent = `⭐ XP: ${xp}`;
  document.getElementById("energy").textContent = "❤️".repeat(hearts) + "🖤".repeat(4 - hearts);
  questBtn.disabled = true;
  questBtn.textContent = "✅ Quest Completed";
});

// 🚪 Logout
logoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "login.html";
});

// 👀 Auth State (main block)
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  console.log("Logged in user:", user.uid, user.email);

  // Profile
  const profileRef = doc(db, "users", user.uid, "data", "profile");
  const profileSnap = await getDoc(profileRef);
  usernameEl.textContent =
    (profileSnap.exists() && profileSnap.data().username) ||
    user.displayName ||
    user.email.split("@")[0];

  // Stats + XP + Hearts + Streak
  try {
    const statsRef = doc(db, "users", user.uid, "data", "stats");
    const statsSnap = await getDoc(statsRef);
    let xp = 0, streak = 0, hearts = 4;

    if (!statsSnap.exists()) {
      await setDoc(statsRef, { xp, streak, hearts, lastWorkoutDate: "", updatedAt: serverTimestamp() });
    } else ({ xp, streak, hearts } = statsSnap.data());

    xpEl.textContent = `⭐ XP: ${xp}`;
    streakEl.textContent = `🔥 Streak: ${streak} days`;
    document.getElementById("energy").textContent = "❤️".repeat(hearts) + "🖤".repeat(4 - hearts);

    const level = getLevelFromXP(xp);
    gymifyLevelEl.textContent = `${level.icon} ${level.tier}`;
    const xpBar = document.getElementById("xp-bar");
    if (xpBar) xpBar.style.width = `${getLevelProgress(xp)}%`;
  } catch (e) {
    console.error("⚠️ Error loading stats:", e);
  }

  // Load workouts + quest
  await loadNextWorkout(user);
  await loadDailyQuest(user);
});
