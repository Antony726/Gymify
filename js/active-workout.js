import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, collection, addDoc, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { processWorkoutLogStats, toLocalDateStr } from "./streak-utils.js";
import { announcePRs, showPRCelebration } from "./pr-utils.js";
import { refreshBuddyChallengeProgress } from "./buddy-challenges.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Elements
const exerciseNameEl = document.getElementById("exercise-name");
const exerciseTargetEl = document.getElementById("exercise-target");
const progressTextEl = document.getElementById("workout-progress");
const progressBarEl = document.getElementById("progress-bar");
const setsContainer = document.getElementById("sets-container");
const addSetBtn = document.getElementById("add-set-btn");
const skipExBtn = document.getElementById("skip-ex-btn");
const nextExBtn = document.getElementById("next-ex-btn");
const finishWorkoutBtn = document.getElementById("finish-workout-btn");

// Timer DOM Elements
const timerOverlay = document.getElementById("restTimerOverlay");
const timerCircle = document.getElementById("timerCircle");
const timerValueEl = document.getElementById("timerValue");
const timerExerciseNameEl = document.getElementById("timer-exercise-name");
const timerSkipBtn = document.getElementById("timer-skip-btn");
const timerAdd30Btn = document.getElementById("timer-add30-btn");

// Session State
let userUID = null;
let rawExercises = [];
let exercisesList = [];
let currentExIndex = 0;
let currentExerciseSets = []; // { set, weight, reps, completed }
let loggedWorkoutLogs = [];   // Compiled exercise logs to save at the end

// Timer State
let timerInterval = null;
let defaultRestDuration = parseInt(localStorage.getItem("defaultRestDuration")) || 60;
let timerTotalTime = defaultRestDuration;
let timerTimeLeft = defaultRestDuration;

const timerDecBtn = document.getElementById("timer-dec-btn");
const timerIncBtn = document.getElementById("timer-inc-btn");
const defaultRestDisplay = document.getElementById("defaultRestDisplay");

if (defaultRestDisplay) {
  defaultRestDisplay.textContent = `${defaultRestDuration}s`;
}

// === 🧭 1. Parse Exercise Helpers ===
function parseExercise(exStr) {
  // e.g. "Bench Press (3 sets x 10 reps)" or "Pull-Ups (3 sets)"
  const match = exStr.match(/(.+?)\s*\((.+?)\)/);
  if (match) {
    const name = match[1].trim();
    const instruction = match[2].trim();
    
    // Parse sets
    const setsMatch = instruction.match(/(\d+)\s*sets?/i);
    const setsCount = setsMatch ? parseInt(setsMatch[1]) : 3;
    
    // Parse reps
    const repsMatch = instruction.match(/(\d+)\s*reps?/i);
    const repsCount = repsMatch ? parseInt(repsMatch[1]) : 10;
    
    return { name, instruction, defaultSets: setsCount, defaultReps: repsCount };
  }
  return { name: exStr.trim(), instruction: "3 sets", defaultSets: 3, defaultReps: 10 };
}

// === 🔑 2. Auth State Listener & Autosave Resume ===
function saveSessionProgress() {
  if (!userUID || exercisesList.length === 0) return;
  const todayStr = toLocalDateStr();
  const progressState = {
    date: todayStr,
    currentExIndex,
    currentExerciseSets,
    loggedWorkoutLogs
  };
  localStorage.setItem(`activeWorkoutState_${userUID}`, JSON.stringify(progressState));
}

async function applyActiveWorkoutStats({ logDate, gainedXP, isExitSave = false }) {
  const statsRef = doc(db, "users", userUID, "data", "stats");
  const statsSnap = await getDoc(statsRef);
  const planRef = doc(db, "users", userUID, "data", "plan");
  const planSnap = await getDoc(planRef);
  const plan = planSnap.exists() ? planSnap.data() : {};

  const existingStats = statsSnap.exists() ? statsSnap.data() : {};
  const result = await processWorkoutLogStats({
    db,
    userId: userUID,
    stats: existingStats,
    plan,
    logDate,
    gainedXP,
  });

  await setDoc(statsRef, {
    xp: result.xp,
    streak: result.streak,
    hearts: result.hearts,
    lastLogDate: result.lastLogDate,
    streakCheckDate: result.streakCheckDate,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  const lbRef = doc(db, "leaderboard", userUID);
  await setDoc(lbRef, {
    xp: result.xp,
    streak: result.streak,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  return result;
}

function showWorkoutCompleteScreen() {
  exerciseNameEl.textContent = "🎉 Workout Session Complete!";
  exerciseTargetEl.textContent = "Click 'Finish Workout' below to save your progress.";
  setsContainer.innerHTML = `
    <div style="text-align: center; padding: 30px 20px;">
      <p style="font-size: 15px; color: var(--color-success); font-weight: 700; margin-bottom: 10px;">🏆 All Exercises Completed or Logged!</p>
      <p style="font-size: 12px; color: var(--text-secondary);">Your sets and reps have been compiled. Click finish to claim your XP and update your daily streak.</p>
    </div>
  `;
  addSetBtn.style.display = "none";
  skipExBtn.style.display = "none";
  nextExBtn.style.display = "none";
  finishWorkoutBtn.style.display = "block";
  progressTextEl.textContent = "Workout Complete";
  progressBarEl.style.width = "100%";
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  userUID = user.uid;
  
  // Check for saved session from today
  const todayStr = toLocalDateStr();
  const savedState = localStorage.getItem(`activeWorkoutState_${userUID}`);
  if (savedState) {
    try {
      const state = JSON.parse(savedState);
      if (state.date === todayStr) {
        const resumeModal = document.getElementById("resumeModal");
        if (resumeModal) {
          resumeModal.style.display = "flex";
          setTimeout(() => { resumeModal.style.opacity = "1"; }, 10);
          
          document.getElementById("resume-yes-btn").onclick = async () => {
            resumeModal.style.opacity = "0";
            setTimeout(() => { resumeModal.style.display = "none"; }, 300);
            await loadTodayWorkout(true);
          };
          
          document.getElementById("resume-no-btn").onclick = async () => {
            if (confirm("🗑️ Are you sure you want to start fresh? Any completed sets in your saved progress will still be saved to your logs.")) {
              const savedState = localStorage.getItem(`activeWorkoutState_${userUID}`);
              if (savedState) {
                try {
                  const state = JSON.parse(savedState);
                  let savedLogs = state.loggedWorkoutLogs || [];
                  const currentCompletedSets = (state.currentExerciseSets || []).filter(s => s.completed);
                  
                  if (currentCompletedSets.length > 0) {
                    const planRef = doc(db, "users", userUID, "data", "plan");
                    const planSnap = await getDoc(planRef);
                    if (planSnap.exists()) {
                      const plan = planSnap.data();
                      const todayName = new Date().toLocaleDateString("en-US", { weekday: "long" });
                      if (plan[todayName] && plan[todayName].exercises) {
                        const rawExs = plan[todayName].exercises.split(",").map(e => e.trim()).filter(Boolean);
                        const parsedExs = rawExs.map(parseExercise);
                        const ex = parsedExs[state.currentExIndex];
                        if (ex) {
                          const loggedIdx = savedLogs.findIndex(log => log.workout.toLowerCase() === ex.name.toLowerCase());
                          const logEntry = {
                            workout: ex.name,
                            sets: currentCompletedSets.map(s => ({ set: s.set, weight: s.weight, reps: s.reps }))
                          };
                          if (loggedIdx >= 0) {
                            savedLogs[loggedIdx] = logEntry;
                          } else {
                            savedLogs.push(logEntry);
                          }
                        }
                      }
                    }
                  }

                  if (savedLogs.length > 0) {
                    if (window.GymifyLoader) {
                      window.GymifyLoader.show("Saving completed sets from previous session...");
                    }
                    const batch = writeBatch(db);
                    const todayStr = toLocalDateStr();
                    for (const log of savedLogs) {
                      const logDocRef = doc(collection(db, "users", userUID, "logs"));
                      batch.set(logDocRef, {
                        workout: log.workout,
                        sets: log.sets,
                        date: todayStr,
                        notes: "Logged via Active Mode ⚡ (Discarded Session & Started Fresh)",
                        timestamp: serverTimestamp()
                      });
                    }

                    await batch.commit();

                    const xpGain = savedLogs.length * 10;
                    await applyActiveWorkoutStats({ logDate: todayStr, gainedXP: xpGain, isExitSave: true });
                    if (window.GymifyLoader) window.GymifyLoader.hide();
                    alert(`🎉 Discarded session progress, but saved ${savedLogs.length} completed exercise(s)!\n⭐ Gained +${xpGain} XP!`);
                  }
                } catch (err) {
                  console.error("Error saving discarded session progress:", err);
                  if (window.GymifyLoader) window.GymifyLoader.hide();
                }
              }
              localStorage.removeItem(`activeWorkoutState_${userUID}`);
              resumeModal.style.opacity = "0";
              setTimeout(() => { resumeModal.style.display = "none"; }, 300);
              await loadTodayWorkout(false);
            }
          };
          return;
        }
      } else {
        localStorage.removeItem(`activeWorkoutState_${userUID}`);
      }
    } catch (e) {
      console.warn("Failed to parse active session state:", e);
      localStorage.removeItem(`activeWorkoutState_${userUID}`);
    }
  }

  await loadTodayWorkout(false);
});

// === 🏋️‍♂️ 3. Load Split from Firestore ===
async function loadTodayWorkout(isResume = false) {
  const todayName = new Date().toLocaleDateString("en-US", { weekday: "long" });

  try {
    const planRef = doc(db, "users", userUID, "data", "plan");
    const planSnap = await getDoc(planRef);

    if (!planSnap.exists()) {
      alert("⚠️ No plan found! Redirecting to plan editor.");
      window.location.href = "plan.html";
      return;
    }

    const plan = planSnap.data();
    if (!plan[todayName] || !plan[todayName].exercises || plan[todayName].type === "Rest") {
      alert("🗓️ Today is a Rest Day! Redirecting to dashboard.");
      window.location.href = "dashboard.html";
      return;
    }

    // Split exercises and parse them
    rawExercises = plan[todayName].exercises.split(",").map(e => e.trim()).filter(Boolean);
    exercisesList = rawExercises.map(parseExercise);

    if (isResume) {
      const savedState = localStorage.getItem(`activeWorkoutState_${userUID}`);
      if (savedState) {
        const state = JSON.parse(savedState);
        currentExIndex = state.currentExIndex;
        currentExerciseSets = state.currentExerciseSets;
        loggedWorkoutLogs = state.loggedWorkoutLogs;
        
        renderCurrentExercise(true);
        return;
      }
    }

    currentExIndex = 0;
    renderCurrentExercise(false);
  } catch (err) {
    console.error("Error loading Split:", err);
  }
}

// === 📝 4. Render Exercise & Sets ===
function renderCurrentExercise(isResume = false) {
  if (currentExIndex >= exercisesList.length) {
    showWorkoutCompleteScreen();
    return;
  }

  const ex = exercisesList[currentExIndex];
  exerciseNameEl.textContent = ex.name;
  exerciseTargetEl.textContent = `Target: ${ex.instruction}`;
  
  // Progress Indicators
  const progressNum = currentExIndex + 1;
  const progressPercent = (currentExIndex / exercisesList.length) * 100;
  progressTextEl.textContent = `Exercise ${progressNum} of ${exercisesList.length}`;
  progressBarEl.style.width = `${progressPercent}%`;

  // Reset button visibilities
  nextExBtn.style.display = "none";
  finishWorkoutBtn.style.display = "none";

  if (!isResume) {
    // Build sets structure for fresh load
    currentExerciseSets = [];
    for (let i = 1; i <= ex.defaultSets; i++) {
      currentExerciseSets.push({
        set: i,
        weight: "",
        reps: ex.defaultReps,
        completed: false
      });
    }
  }

  renderSetsTable();
}

function renderSetsTable() {
  setsContainer.innerHTML = "";
  currentExerciseSets.forEach((s, idx) => {
    const row = document.createElement("div");
    row.className = `set-row ${s.completed ? "completed" : ""}`;
    row.innerHTML = `
      <label>S${s.set}</label>
      <div>
        <input type="number" id="weight-${idx}" placeholder="kg" value="${s.weight}" ${s.completed ? "disabled" : ""} style="width: 80%;" />
      </div>
      <div>
        <input type="number" id="reps-${idx}" placeholder="reps" value="${s.reps}" ${s.completed ? "disabled" : ""} style="width: 80%;" />
      </div>
      <div style="display:flex; justify-content:center;">
        <input type="checkbox" class="set-checkbox" id="check-${idx}" ${s.completed ? "checked" : ""} />
      </div>
    `;
    setsContainer.appendChild(row);

    const checkbox = row.querySelector(".set-checkbox");
    const weightInput = row.querySelector(`#weight-${idx}`);
    const repsInput = row.querySelector(`#reps-${idx}`);

    weightInput.addEventListener("input", (e) => {
      s.weight = e.target.value.trim();
      saveSessionProgress();
    });

    repsInput.addEventListener("input", (e) => {
      s.reps = e.target.value.trim();
      saveSessionProgress();
    });

    checkbox.addEventListener("change", (e) => {
      const weightVal = weightInput.value.trim();
      const repsVal = repsInput.value.trim();

      if (!weightVal || !repsVal) {
        alert("⚠️ Please enter both Weight and Reps before checking!");
        checkbox.checked = false;
        return;
      }

      s.weight = weightVal;
      s.reps = repsVal;
      s.completed = checkbox.checked;

      if (s.completed) {
        row.classList.add("completed");
        weightInput.disabled = true;
        repsInput.disabled = true;
        // Open Rest Timer with configured default duration
        startRestTimer(defaultRestDuration);
      } else {
        row.classList.remove("completed");
        weightInput.disabled = false;
        repsInput.disabled = false;
      }

      saveSessionProgress();
      checkExerciseCompletion();
    });
  });
}

// === ➕ 5. Dynamic Set Adjustments & Skip ===
addSetBtn.addEventListener("click", () => {
  const newSetNum = currentExerciseSets.length + 1;
  const ex = exercisesList[currentExIndex];
  currentExerciseSets.push({
    set: newSetNum,
    weight: "",
    reps: ex.defaultReps,
    completed: false
  });
  renderSetsTable();
  saveSessionProgress();
});

skipExBtn.addEventListener("click", () => {
  if (confirm("⏭️ Are you sure you want to skip this exercise?")) {
    currentExIndex++;
    saveSessionProgress();
    renderCurrentExercise();
  }
});

// Check if all sets are marked complete
function checkExerciseCompletion() {
  if (exercisesList.length === 0) return;
  const allDone = currentExerciseSets.every(s => s.completed);
  if (allDone) {
    const ex = exercisesList[currentExIndex];
    // Check if already logged in loggedWorkoutLogs to prevent duplicates
    const loggedIdx = loggedWorkoutLogs.findIndex(log => log.workout.toLowerCase() === ex.name.toLowerCase());
    const logEntry = {
      workout: ex.name,
      sets: currentExerciseSets.map(s => ({ set: s.set, weight: s.weight, reps: s.reps }))
    };

    if (loggedIdx >= 0) {
      loggedWorkoutLogs[loggedIdx] = logEntry; // update it
    } else {
      loggedWorkoutLogs.push(logEntry); // add it
    }

    if (currentExIndex === exercisesList.length - 1) {
      finishWorkoutBtn.style.display = "block";
      nextExBtn.style.display = "none";
    } else {
      nextExBtn.style.display = "block";
      finishWorkoutBtn.style.display = "none";
    }
  } else {
    nextExBtn.style.display = "none";
    finishWorkoutBtn.style.display = "none";
  }
}

nextExBtn.addEventListener("click", () => {
  currentExIndex++;
  saveSessionProgress();
  renderCurrentExercise();
});

// === ⏱️ 6. Circular Rest Timer Controls ===
function startRestTimer(durationSeconds) {
  clearInterval(timerInterval);
  timerTotalTime = durationSeconds;
  timerTimeLeft = durationSeconds;
  timerExerciseNameEl.textContent = `Up next: Set ${getPendingSetNumber()} of ${exercisesList[currentExIndex].name}`;

  updateTimerDisplay();
  timerOverlay.style.display = "flex";
  setTimeout(() => timerOverlay.classList.add("show"), 10);

  timerInterval = setInterval(() => {
    timerTimeLeft--;
    updateTimerDisplay();

    if (timerTimeLeft <= 0) {
      clearInterval(timerInterval);
      playTimerBeep();
      closeTimer();
    }
  }, 1000);
}

function getPendingSetNumber() {
  const nextSet = currentExerciseSets.find(s => !s.completed);
  return nextSet ? nextSet.set : currentExerciseSets.length;
}

function updateTimerDisplay() {
  timerValueEl.textContent = `${timerTimeLeft}s`;
  // Dashoffset calculation (circumference is 283)
  const offset = 283 - (timerTimeLeft / timerTotalTime) * 283;
  timerCircle.style.strokeDashoffset = offset;
}

function closeTimer() {
  timerOverlay.classList.remove("show");
  setTimeout(() => {
    timerOverlay.style.display = "none";
  }, 300);
}

timerSkipBtn.addEventListener("click", () => {
  clearInterval(timerInterval);
  closeTimer();
});

timerAdd30Btn.addEventListener("click", () => {
  timerTimeLeft += 30;
  timerTotalTime += 30;
  updateTimerDisplay();
});

// Play Audio Alert
function playTimerBeep() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.type = "sine";
    osc.frequency.setValueAtTime(850, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
    
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.5);
  } catch (err) {
    console.warn("AudioContext beep failed:", err);
  }
}

// === 🏁 7. Save Session & Complete ===
async function saveWorkoutSession(isExitSave = false) {
  // If exiting early, compile completed sets for the current exercise if any
  if (isExitSave) {
    const currentCompletedSets = currentExerciseSets.filter(s => s.completed);
    if (currentCompletedSets.length > 0) {
      const ex = exercisesList[currentExIndex];
      const loggedIdx = loggedWorkoutLogs.findIndex(log => log.workout.toLowerCase() === ex.name.toLowerCase());
      const logEntry = {
        workout: ex.name,
        sets: currentCompletedSets.map(s => ({ set: s.set, weight: s.weight, reps: s.reps }))
      };
      if (loggedIdx >= 0) {
        loggedWorkoutLogs[loggedIdx] = logEntry;
      } else {
        loggedWorkoutLogs.push(logEntry);
      }
    }
  }

  if (loggedWorkoutLogs.length === 0) {
    alert("❌ No logged exercises to save!");
    return;
  }

  // Show dynamic duration-based page loader
  if (window.GymifyLoader) {
    window.GymifyLoader.show("Saving Workout Logs...");
  }

  finishWorkoutBtn.disabled = true;
  finishWorkoutBtn.textContent = "💾 Saving Workout...";

  const todayStr = toLocalDateStr();

  try {
    const allPRs = [];
    for (const log of loggedWorkoutLogs) {
      const prs = await announcePRs(db, userUID, log.workout, log.sets);
      allPRs.push(...prs);
    }
    if (allPRs.length > 0) showPRCelebration(allPRs);

    if (window.GymifyLoader) window.GymifyLoader.setProgress(25, "Creating batch logs...");
    const batch = writeBatch(db);

    for (const log of loggedWorkoutLogs) {
      const logDocRef = doc(collection(db, "users", userUID, "logs"));
      batch.set(logDocRef, {
        workout: log.workout,
        sets: log.sets,
        date: todayStr,
        notes: isExitSave ? "Logged via Active Mode ⚡ (Exited Early)" : "Logged via Active Mode ⚡",
        timestamp: serverTimestamp()
      });
    }

    if (window.GymifyLoader) window.GymifyLoader.setProgress(50, "Calculating streak & XP...");
    const xpGain = (loggedWorkoutLogs.length * 10) + (isExitSave ? 0 : 10);

    if (window.GymifyLoader) window.GymifyLoader.setProgress(80, "Syncing to leaderboard...");
    await batch.commit();

    const streakResult = await applyActiveWorkoutStats({
      logDate: todayStr,
      gainedXP: xpGain,
      isExitSave,
    });
    try { await refreshBuddyChallengeProgress(db, userUID); } catch (e) {}
    const { streak, resetXP, lostHeart, missedDays, isSameDay } = streakResult;

    localStorage.setItem("refreshDashboardWorkout", "true");
    localStorage.removeItem(`activeWorkoutState_${userUID}`);

    if (window.GymifyLoader) {
      window.GymifyLoader.hide();
    }

    if (resetXP) {
      alert("💀 All hearts lost! XP reset. 4 hearts given. Fresh start!");
    } else if (lostHeart && missedDays.length > 0) {
      alert(`💔 Missed ${missedDays.length} workout day(s)! Lost ${missedDays.length} heart(s).\n⭐ Gained +${xpGain} XP\n🔥 Streak: ${streak} days`);
    } else if (isSameDay) {
      alert(`🎉 Workout Saved!\n⭐ Gained +${xpGain} XP!\n🔥 Streak unchanged: ${streak} days`);
    } else {
      alert(`🎉 Workout Saved!\n⭐ Gained +${xpGain} XP!\n🔥 Current Streak: ${streak} days!`);
    }
    window.location.href = "dashboard.html";

  } catch (err) {
    console.error("Error saving active session logs:", err);
    // Hide dynamic loader on error
    if (window.GymifyLoader) {
      window.GymifyLoader.hide();
    }
    alert("❌ Failed to save workout. Please try again.");
    finishWorkoutBtn.disabled = false;
    finishWorkoutBtn.textContent = "🏁 Finish Workout";
  }
}

finishWorkoutBtn.addEventListener("click", async () => {
  await saveWorkoutSession(false);
});

// Exit Handlers
const exitModal = document.getElementById("exitModal");
const exitSaveBtn = document.getElementById("exit-save-btn");
const exitDiscardBtn = document.getElementById("exit-discard-btn");
const exitCancelBtn = document.getElementById("exit-cancel-btn");

window.confirmExit = function() {
  if (exitModal) {
    exitModal.style.display = "flex";
    setTimeout(() => { exitModal.style.opacity = "1"; }, 10);
  }
};

const closeExitModal = () => {
  if (exitModal) {
    exitModal.style.opacity = "0";
    setTimeout(() => { exitModal.style.display = "none"; }, 300);
  }
};

if (exitCancelBtn) {
  exitCancelBtn.addEventListener("click", closeExitModal);
}

if (exitModal) {
  exitModal.addEventListener("click", (e) => {
    if (e.target === exitModal) closeExitModal();
  });
}

if (exitDiscardBtn) {
  exitDiscardBtn.addEventListener("click", async () => {
    if (confirm("🗑️ Are you sure you want to exit? Your completed exercises and sets so far will be saved to your logs.")) {
      closeExitModal();
      
      const currentCompletedSets = currentExerciseSets.filter(s => s.completed);
      if (loggedWorkoutLogs.length === 0 && currentCompletedSets.length === 0) {
        localStorage.removeItem(`activeWorkoutState_${userUID}`);
        window.location.href = "dashboard.html";
        return;
      }
      
      await saveWorkoutSession(true);
    }
  });
}

if (exitSaveBtn) {
  exitSaveBtn.addEventListener("click", async () => {
    closeExitModal();
    
    // Compile current completed sets
    const currentCompletedSets = currentExerciseSets.filter(s => s.completed);
    if (loggedWorkoutLogs.length === 0 && currentCompletedSets.length === 0) {
      alert("⚠️ You haven't completed any sets yet to save! Discarding session instead.");
      localStorage.removeItem(`activeWorkoutState_${userUID}`);
      window.location.href = "dashboard.html";
      return;
    }
    
    await saveWorkoutSession(true);
  });
}

// Default timer adjustments click listeners
if (timerDecBtn) {
  timerDecBtn.addEventListener("click", () => {
    defaultRestDuration = Math.max(5, defaultRestDuration - 10);
    localStorage.setItem("defaultRestDuration", defaultRestDuration);
    if (defaultRestDisplay) defaultRestDisplay.textContent = `${defaultRestDuration}s`;
    
    // If timer is currently running/active
    if (timerOverlay && timerOverlay.style.display === "flex") {
      timerTimeLeft = Math.max(5, timerTimeLeft - 10);
      timerTotalTime = Math.max(5, timerTotalTime - 10);
      updateTimerDisplay();
    }
  });
}

if (timerIncBtn) {
  timerIncBtn.addEventListener("click", () => {
    defaultRestDuration = Math.min(300, defaultRestDuration + 10);
    localStorage.setItem("defaultRestDuration", defaultRestDuration);
    if (defaultRestDisplay) defaultRestDisplay.textContent = `${defaultRestDuration}s`;
    
    // If timer is currently running/active
    if (timerOverlay && timerOverlay.style.display === "flex") {
      timerTimeLeft += 10;
      timerTotalTime += 10;
      updateTimerDisplay();
    }
  });
}
