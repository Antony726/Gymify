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
  "Stop being soft. You cannot become a monster by staying in your comfort zone.",
  "The only time you grow, the only time you get better, is when you hit that point of wanting to quit and you keep going instead.",
  "No pain, no gain – but no rest, no growth either.",
   "Why do we fall, Bruce? So we can learn to pick ourselves up",
  "Show up today for a stronger you tomorrow.",
  "Discipline beats motivation every time.",
  "If it doesn't challenge you, it won't change you.",
  "Small progress is still progress!",
];

// 🧩 Level calculation — 200 XP per level
function getLevelFromXP(xp) {
  const xpPerLevel = 200;
  const level = Math.floor(xp / xpPerLevel) + 1;
  const currentMin = (level - 1) * xpPerLevel;
  return { level, min: currentMin, xpPerLevel };
}

// 📈 Level progress %
function getLevelProgress(xp) {
  const { min, xpPerLevel } = getLevelFromXP(xp);
  return Math.min(100, Math.round(((xp - min) / xpPerLevel) * 100));
}

// 💪 Next workout loader
async function loadNextWorkout(user) {
  const todayDiv = document.getElementById("workout-split");
  const nextDiv = document.getElementById("next-workout");

  todayDiv.textContent = "Loading...";
  nextDiv.textContent = "Loading...";

  try {
    const planRef = doc(db, "users", user.uid, "data", "plan");
    const planSnap = await getDoc(planRef);

    if (!planSnap.exists()) {
      todayDiv.textContent = "⚠️ No workout plan found.";
      nextDiv.textContent = "";
      return;
    }

    const plan = planSnap.data();
    const todayName = new Date().toLocaleDateString("en-US", { weekday: "long" });

    if (!plan[todayName] || !plan[todayName].exercises) {
      todayDiv.textContent = `🗓️ Rest day or no plan found for ${todayName}.`;
      nextDiv.textContent = "";
      return;
    }

    // 💪 Exercises for today
    const todayExercises = plan[todayName].exercises.split(",").map(e => e.trim());

    // 🕒 Get today's logs
    const logsRef = collection(db, "users", user.uid, "logs");
    const q = query(logsRef, orderBy("timestamp", "desc"), limit(50));
    const snapshot = await getDocs(q);
    const todayDate = new Date().toISOString().split("T")[0];

    const todayLogs = snapshot.docs
      .map(d => d.data())
      .filter(log => log.date && log.date.startsWith(todayDate));

    const doneExercises = todayLogs
      .map(l => {
        // Extract just the exercise name portion
        if (l.workout?.includes(" - ")) {
          return l.workout.split(" - ")[1].trim();
        }
        return l.workout?.trim();
      })
      .filter(Boolean);

    const nextExercise = todayExercises.find(e => !doneExercises.includes(e));

    // 🧾 Update today's workout section
    todayDiv.innerHTML = `
      <b>${todayName} Workout:</b><br>
      ${todayExercises.map(ex => 
        doneExercises.includes(ex)
          ? `✅ ${ex}`
          : `⬜ ${ex}`
      ).join("<br>")}
    `;

    // 🎯 Next workout suggestion
    if (!nextExercise) {
      nextDiv.textContent = "✅ All workouts completed for today!";
    } else {
      nextDiv.innerHTML = `<b>Next up:</b> ${nextExercise}`;
    }
  } catch (err) {
    console.error("❌ Error loading next workout:", err);
    todayDiv.textContent = "❌ Error loading workout.";
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

// 🔄 Update hearts display helper
function updateHeartsDisplay(hearts) {
  const energyEl = document.getElementById("energy");
  if (energyEl) {
    const maxHearts = 4;
    const validHearts = Math.max(0, Math.min(maxHearts, hearts || 0));
    energyEl.innerHTML = "❤️".repeat(validHearts) + "🖤".repeat(maxHearts - validHearts);
    energyEl.classList.add("animate");
    setTimeout(() => energyEl.classList.remove("animate"), 300);
  }
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
  updateHeartsDisplay(hearts);
  
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
      await setDoc(statsRef, { xp, streak, hearts, lastLogDate: "", updatedAt: serverTimestamp() });
    } else {
      const data = statsSnap.data();
      xp = data.xp || 0;
      streak = data.streak || 0;
      hearts = data.hearts !== undefined ? data.hearts : 4;
    }

    // Display stats
    xpEl.textContent = `⭐ XP: ${xp}`;
    streakEl.textContent = `🔥 Streak: ${streak} days`;
    updateHeartsDisplay(hearts);

    const levelInfo = getLevelFromXP(xp);
    gymifyLevelEl.innerHTML = `<b style="color:#ffcc00;">${levelInfo.level}</b>`;

    const xpBar = document.getElementById("xp-bar");
    if (xpBar) xpBar.style.width = `${getLevelProgress(xp)}%`;
  } catch (e) {
    console.error("⚠️ Error loading stats:", e);
  }

  // Load workouts + quest
  await loadNextWorkout(user);

  // If user just came from workout page after logging
  if (localStorage.getItem("refreshDashboardWorkout") === "true") {
    console.log("Detected refresh flag — reloading next workout...");
    await loadNextWorkout(user);
    localStorage.removeItem("refreshDashboardWorkout");
  }

  await loadDailyQuest(user);
});

// 💧 Water Tracker Logic
const waterCountEl = document.getElementById("waterCount");
const addWaterBtn = document.getElementById("addWater");

// Load from localStorage
let waterCount = parseInt(localStorage.getItem("waterCount")) || 0;
const lastDate = localStorage.getItem("lastWaterDate");
const today = new Date().toDateString();

// Reset daily water count automatically
if (lastDate !== today) {
  waterCount = 0;
  localStorage.setItem("lastWaterDate", today);
}

waterCountEl.textContent = waterCount;

addWaterBtn.addEventListener("click", () => {
  if (waterCount < 10) {
    waterCount++;
    localStorage.setItem("waterCount", waterCount);
    localStorage.setItem("lastWaterDate", today);
    waterCountEl.textContent = waterCount;
  } else {
    alert("💧 You've reached your daily goal of 10 glasses!");
  }
});

// Optional reminder every 2 hours
setInterval(() => {
  alert("💧 Time to drink some water!");
}, 2 * 60 * 60 * 1000); // every 2 hours


// ⏱️ Rest Timer Logic
const startTimerBtn = document.getElementById("startTimer");
const timerDisplay = document.getElementById("timerDisplay");
const restInput = document.getElementById("restInput");

startTimerBtn.addEventListener("click", () => {
  let timeLeft = parseInt(restInput.value);

  if (isNaN(timeLeft) || timeLeft <= 0) {
    alert("⏱️ Enter a valid rest time!");
    return;
  }

  timerDisplay.textContent = `Time Left: ${timeLeft}s`;

  const interval = setInterval(() => {
    timeLeft--;
    timerDisplay.textContent = `Time Left: ${timeLeft}s`;

    if (timeLeft <= 0) {
      clearInterval(interval);
      timerDisplay.textContent = "🔥 Time's up! Get back to work!";
      const audio = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
      audio.play();
    }
  }, 1000);
});
const hamburgerBtn = document.getElementById("hamburger-btn");
const hamburgerMenu = document.getElementById("hamburger-menu");
const closeBtn = document.getElementById("close-btn");

hamburgerBtn.addEventListener("click", () => {
  hamburgerMenu.classList.add("show");
});

closeBtn.addEventListener("click", () => {
  hamburgerMenu.classList.remove("show");
});
