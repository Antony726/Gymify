import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, collection, addDoc, serverTimestamp, writeBatch, query, orderBy, getDocs
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { enhanceAllSelects, initCustomDropdown, refreshCustomDropdown } from "./custom-dropdown.js";
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

// Queue DOM Elements
const queueListEl = document.getElementById("queue-list");
const extraExerciseInput = document.getElementById("extra-exercise-input");
const addExtraBtn = document.getElementById("add-extra-btn");

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
let planType = "days";
let slotsCount = 3;
let currentSlotIndex = 0;

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
  let name = exStr.trim();
  let instruction = "3 sets";
  let defaultSets = 3;
  let defaultReps = 10;
  
  if (match) {
    name = match[1].trim();
    instruction = match[2].trim();
    const setsMatch = instruction.match(/(\d+)\s*sets?/i);
    defaultSets = setsMatch ? parseInt(setsMatch[1]) : 3;
    const repsMatch = instruction.match(/(\d+)\s*reps?/i);
    defaultReps = repsMatch ? parseInt(repsMatch[1]) : 10;
  }

  const sets = [];
  for (let i = 1; i <= defaultSets; i++) {
    sets.push({
      set: i,
      weight: "",
      reps: defaultReps,
      completed: false
    });
  }

  return {
    name,
    instruction,
    defaultSets,
    defaultReps,
    sets,
    status: "pending"
  };
}

// === 🔑 2. Auth State Listener & Autosave Resume ===
let activeRoutineKey = "today";

function saveSessionProgress() {
  if (!userUID) return;
  const todayStr = toLocalDateStr();
  const progressState = {
    date: todayStr,
    currentExIndex,
    currentExerciseSets,
    loggedWorkoutLogs,
    exercisesList,
    activeRoutineKey
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

  const updateData = {
    xp: result.xp,
    streak: result.streak,
    hearts: result.hearts,
    lastLogDate: result.lastLogDate,
    streakCheckDate: result.streakCheckDate,
    updatedAt: serverTimestamp(),
  };

  // If slot plan finished, advance the slot index
  if (planType === "slots" && !isExitSave) {
    const nextSlotIdx = ((existingStats.currentSlotIndex || 0) + 1) % slotsCount;
    updateData.currentSlotIndex = nextSlotIdx;
  }

  await setDoc(statsRef, updateData, { merge: true });

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

// === 🏋️‍♂️ Autofill Progression Weights Logic ===
async function getAutofillWeights(exName) {
  try {
    const logsRef = collection(db, "users", userUID, "logs");
    const q = query(logsRef, orderBy("timestamp", "desc"));
    const snap = await getDocs(q);
    
    const matchLogs = [];
    snap.forEach(docSnap => {
      const log = docSnap.data();
      const logExName = log.workout?.includes(" - ") ? log.workout.split(" - ")[1].trim() : log.workout?.trim();
      if (logExName && logExName.toLowerCase() === exName.toLowerCase()) {
        matchLogs.push(log);
      }
    });

    if (matchLogs.length === 0) return null;

    const session1Sets = matchLogs[0].sets || [];
    const session2Sets = matchLogs.length > 1 ? matchLogs[1].sets : null;

    const w1 = session1Sets.map(s => parseFloat(s.weight)).filter(w => !isNaN(w));
    const w2 = session2Sets ? session2Sets.map(s => parseFloat(s.weight)).filter(w => !isNaN(w)) : null;

    let identical = false;
    if (w1 && w2 && w1.length === w2.length) {
      identical = w1.every((val, index) => val === w2[index]);
    }

    if (identical) {
      return session1Sets.map(s => s.weight);
    } else {
      const suggested = [];
      for (let i = 0; i < currentExerciseSets.length; i++) {
        if (i + 1 < session1Sets.length) {
          suggested.push(session1Sets[i + 1].weight);
        } else {
          const lastWeightVal = parseFloat(session1Sets[session1Sets.length - 1]?.weight);
          if (!isNaN(lastWeightVal)) {
            suggested.push((lastWeightVal + 2.5).toString());
          } else {
            suggested.push(session1Sets[session1Sets.length - 1]?.weight || "");
          }
        }
      }
      return suggested;
    }
  } catch (err) {
    console.error("Error fetching autofill weights:", err);
    return null;
  }
}

// === 📋 Exercise Queue rendering ===
function renderQueueList() {
  if (!queueListEl) return;
  queueListEl.innerHTML = "";

  exercisesList.forEach((ex, idx) => {
    const isCurrent = idx === currentExIndex;
    const isCompleted = ex.status === 'completed' || ex.status === 'skipped';
    
    const queueItem = document.createElement("div");
    queueItem.className = "queue-item";
    queueItem.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: ${isCurrent ? "rgba(6, 182, 212, 0.08)" : "rgba(255, 255, 255, 0.02)"};
      border: 1px solid ${isCurrent ? "var(--color-accent)" : "var(--border-color)"};
      padding: 8px 12px;
      border-radius: 10px;
      font-size: 13px;
      opacity: ${isCompleted ? "0.5" : "1"};
    `;

    // Status Indicator
    let statusText = "⬜";
    if (isCurrent) statusText = "⚡";
    if (ex.status === "completed") statusText = "✅";
    if (ex.status === "skipped") statusText = "⏭️";

    queueItem.innerHTML = `
      <div style="flex:1; min-width:0; margin-right:8px; display:flex; align-items:center; gap:6px;">
        <span style="font-size:11px;">${statusText}</span>
        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:${isCurrent ? '700' : '400'}">${ex.name}</span>
      </div>
      <div style="display: flex; gap: 4px; align-items: center;">
        <button type="button" class="btn btn-secondary queue-up-btn" data-idx="${idx}" style="padding: 2px 6px; font-size: 10px; min-width:auto; height:auto; margin:0;" ${idx === 0 || isCompleted ? 'disabled' : ''}>▲</button>
        <button type="button" class="btn btn-secondary queue-down-btn" data-idx="${idx}" style="padding: 2px 6px; font-size: 10px; min-width:auto; height:auto; margin:0;" ${idx === exercisesList.length - 1 || isCompleted ? 'disabled' : ''}>▼</button>
        <button type="button" class="btn btn-secondary queue-del-btn" data-idx="${idx}" style="padding: 2px 6px; font-size: 10px; min-width:auto; height:auto; margin:0; background:rgba(244,63,94,0.1); border-color:rgba(244,63,94,0.2); color:#f43f5e;" ${isCompleted ? 'disabled' : ''}>✕</button>
      </div>
    `;

    // Bind Button Click listeners
    queueItem.querySelector(".queue-up-btn").onclick = (e) => {
      e.stopPropagation();
      swapQueueItems(idx, idx - 1);
    };

    queueItem.querySelector(".queue-down-btn").onclick = (e) => {
      e.stopPropagation();
      swapQueueItems(idx, idx + 1);
    };

    queueItem.querySelector(".queue-del-btn").onclick = (e) => {
      e.stopPropagation();
      if (confirm(`🗑️ Remove "${ex.name}" from active workout queue?`)) {
        removeQueueItem(idx);
      }
    };

    queueListEl.appendChild(queueItem);
  });
}

function swapQueueItems(i, j) {
  // Swap positions in list
  const temp = exercisesList[i];
  exercisesList[i] = exercisesList[j];
  exercisesList[j] = temp;

  // Sync active exercise index
  if (currentExIndex === i) {
    currentExIndex = j;
  } else if (currentExIndex === j) {
    currentExIndex = i;
  }

  saveSessionProgress();
  renderCurrentExercise(true);
}

function removeQueueItem(index) {
  exercisesList.splice(index, 1);
  if (currentExIndex > index) {
    currentExIndex--;
  } else if (currentExIndex === index) {
    // We deleted the active exercise
    if (currentExIndex >= exercisesList.length) {
      currentExIndex = exercisesList.length - 1;
      if (currentExIndex < 0) currentExIndex = 0;
    }
  }

  saveSessionProgress();
  renderCurrentExercise(true);
}

const defaultLibraryExercises = [
  "Incline Bench Press",
  "Squats",
  "Deadlift",
  "Push-Ups",
  "Pull-Ups",
  "Shoulder Press",
  "Lunges",
  "Plank",
  "Bicep Curls",
  "Tricep Dips",
  "Leg Raises",
  "Mountain Climbers"
];

// Add Extra Exercise trigger
if (addExtraBtn) {
  addExtraBtn.addEventListener("click", () => {
    const selectEl = document.getElementById("extra-exercise-select");
    const inputEl = document.getElementById("extra-exercise-input");
    if (!selectEl) return;

    let exStr = "";
    if (selectEl.value === "custom") {
      exStr = inputEl.value.trim();
      if (!exStr) {
        alert("⚠️ Please type your custom exercise!");
        return;
      }
    } else if (selectEl.value) {
      exStr = `${selectEl.value} (3 sets x 10 reps)`;
    } else {
      alert("⚠️ Please select an exercise or choose 'Custom'!");
      return;
    }

    const parsed = parseExercise(exStr);
    exercisesList.push(parsed);
    
    // Reset inputs
    inputEl.value = "";
    selectEl.value = "";
    inputEl.style.display = "none";
    if (selectEl._customDropdownApi) selectEl._customDropdownApi.updateLabel();

    if (window.showToast) window.showToast(`✅ Added ${parsed.name} to workout!`, "success");

    saveSessionProgress();
    
    // If workout was completed, restore layout to render the new item
    if (currentExIndex >= exercisesList.length - 1) {
      currentExIndex = exercisesList.length - 1;
      renderCurrentExercise(false);
    } else {
      renderQueueList();
      // Update progress bar scale
      const processedCount = exercisesList.filter(e => e.status === "completed" || e.status === "skipped").length;
      const progressPercent = (processedCount / exercisesList.length) * 100;
      const progressNum = Math.min(exercisesList.length, processedCount + 1);
      progressTextEl.textContent = `Exercise ${progressNum} of ${exercisesList.length}`;
      progressBarEl.style.width = `${progressPercent}%`;
    }
  });

  const selectEl = document.getElementById("extra-exercise-select");
  const inputEl = document.getElementById("extra-exercise-input");
  if (selectEl && inputEl) {
    selectEl.addEventListener("change", () => {
      if (selectEl.value === "custom") {
        inputEl.style.display = "block";
        inputEl.required = true;
      } else {
        inputEl.style.display = "none";
        inputEl.required = false;
      }
    });
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  userUID = user.uid;

  // 1. Fetch personalization details & populate dropdown list
  let planData = {};
  try {
    const personalizeRef = doc(db, "users", user.uid, "data", "personalization");
    const personalizeSnap = await getDoc(personalizeRef);
    if (personalizeSnap.exists()) {
      const pData = personalizeSnap.data();
      planType = pData.planType || "days";
      slotsCount = pData.slotsCount || 3;
    }

    const planRef = doc(db, "users", user.uid, "data", "plan");
    const planSnap = await getDoc(planRef);
    if (planSnap.exists()) {
      planData = planSnap.data();
    }

    // Populate Routine Selector
    const routineSelect = document.getElementById("workout-routine-select");
    if (routineSelect) {
      routineSelect.innerHTML = "";

      // Determine today's planned key
      let todayKey = "";
      if (planType === "slots") {
        const statsRef = doc(db, "users", user.uid, "data", "stats");
        const statsSnap = await getDoc(statsRef);
        const curSlotIdx = statsSnap.exists() ? (statsSnap.data().currentSlotIndex || 0) : 0;
        const slotNum = (curSlotIdx % slotsCount) + 1;
        todayKey = `Slot ${slotNum}`;
      } else {
        todayKey = new Date().toLocaleDateString("en-US", { weekday: "long" });
      }

      // Add "Today's Workout" option
      if (planData[todayKey] && planData[todayKey].exercises && planData[todayKey].type !== "Rest") {
        const displayName = planType === "slots" ? `Workout Slot ${((currentSlotIndex || 0) % slotsCount) + 1}` : todayKey;
        routineSelect.innerHTML += `<option value="today">Today: ${displayName} (${planData[todayKey].type})</option>`;
      } else {
        routineSelect.innerHTML += `<option value="today">Today: Rest Day 😴</option>`;
      }

      // Add all non-Rest planned workouts
      const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
      const slotKeys = [];
      for (let s = 1; s <= slotsCount; s++) slotKeys.push(`Slot ${s}`);

      const targetKeys = planType === "slots" ? slotKeys : weekdays;

      targetKeys.forEach(key => {
        if (planData[key] && planData[key].exercises && planData[key].type !== "Rest") {
          const displayName = planType === "slots" ? `Workout ${key}` : key;
          routineSelect.innerHTML += `<option value="${key}">${displayName} (${planData[key].type})</option>`;
        }
      });

      routineSelect.innerHTML += `<option value="custom">✨ Custom Workout (Empty)</option>`;

      // Add change event listener
      routineSelect.addEventListener("change", async () => {
        const selectedVal = routineSelect.value;
        const completedSetsCount = loggedWorkoutLogs.length + (currentExerciseSets.filter(s => s.completed).length);
        if (completedSetsCount > 0) {
          if (!confirm("⚠️ Changing workout routine will discard your active session progress. Proceed?")) {
            routineSelect.value = activeRoutineKey;
            refreshCustomDropdown(routineSelect);
            return;
          }
        }

        activeRoutineKey = selectedVal;
        await loadSelectedRoutine(selectedVal, planData);
      });
    }

    const selectEl = document.getElementById("extra-exercise-select");
    if (selectEl) {
      selectEl.innerHTML = `<option value="">-- Select Exercise --</option>`;
      
      // Default library options
      defaultLibraryExercises.forEach(exName => {
        selectEl.innerHTML += `<option value="${exName}">${exName}</option>`;
      });

      // User custom library options
      try {
        const customRef = collection(db, "users", user.uid, "customExercises");
        const customSnap = await getDocs(customRef);
        customSnap.forEach(docSnap => {
          const data = docSnap.data();
          if (data.name && !defaultLibraryExercises.includes(data.name)) {
            selectEl.innerHTML += `<option value="${data.name}">${data.name} (Custom)</option>`;
          }
        });
      } catch (err) {
        console.warn("Could not load custom exercises for selector:", err);
      }

      selectEl.innerHTML += `<option value="custom">➕ Custom Exercise...</option>`;
    }
  } catch (e) {
    console.error("Error loading personalization in active workout:", e);
  }
  
  // Enhance all selects
  enhanceAllSelects();

  // 2. Check for saved session from today
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
            activeRoutineKey = state.activeRoutineKey || "today";
            const routineSelect = document.getElementById("workout-routine-select");
            if (routineSelect) {
              routineSelect.value = activeRoutineKey;
              refreshCustomDropdown(routineSelect);
            }
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
                      
                      let targetKey = "";
                      if (planType === "slots") {
                        const statsRef = doc(db, "users", userUID, "data", "stats");
                        const statsSnap = await getDoc(statsRef);
                        const curSlotIdx = statsSnap.exists() ? (statsSnap.data().currentSlotIndex || 0) : 0;
                        const slotNum = (curSlotIdx % slotsCount) + 1;
                        targetKey = `Slot ${slotNum}`;
                      } else {
                        targetKey = new Date().toLocaleDateString("en-US", { weekday: "long" });
                      }
                      
                      if (plan[targetKey] && plan[targetKey].exercises) {
                        const rawExs = plan[targetKey].exercises.split(",").map(e => e.trim()).filter(Boolean);
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
async function loadSelectedRoutine(routineKey, plan) {
  if (routineKey === "today") {
    let todayKey = "";
    if (planType === "slots") {
      const slotNum = (currentSlotIndex % slotsCount) + 1;
      todayKey = `Slot ${slotNum}`;
    } else {
      todayKey = new Date().toLocaleDateString("en-US", { weekday: "long" });
    }

    if (!plan[todayKey] || !plan[todayKey].exercises || plan[todayKey].type === "Rest") {
      loadEmptyCustomWorkout();
      return;
    }

    rawExercises = plan[todayKey].exercises.split(",").map(e => e.trim()).filter(Boolean);
    exercisesList = rawExercises.map(parseExercise);
  } else if (routineKey === "custom") {
    loadEmptyCustomWorkout();
    return;
  } else {
    if (plan[routineKey] && plan[routineKey].exercises) {
      rawExercises = plan[routineKey].exercises.split(",").map(e => e.trim()).filter(Boolean);
      exercisesList = rawExercises.map(parseExercise);
    } else {
      loadEmptyCustomWorkout();
      return;
    }
  }

  currentExIndex = 0;
  loggedWorkoutLogs = [];
  saveSessionProgress();
  renderCurrentExercise(false);
}

function loadEmptyCustomWorkout() {
  exercisesList = [];
  currentExIndex = 0;
  loggedWorkoutLogs = [];
  saveSessionProgress();
  showWorkoutCompleteScreen();
}

async function loadTodayWorkout(isResume = false) {
  try {
    const statsRef = doc(db, "users", userUID, "data", "stats");
    const statsSnap = await getDoc(statsRef);
    if (statsSnap.exists()) {
      currentSlotIndex = statsSnap.data().currentSlotIndex || 0;
    }

    const planRef = doc(db, "users", userUID, "data", "plan");
    const planSnap = await getDoc(planRef);

    if (!planSnap.exists()) {
      alert("⚠️ No plan found! Redirecting to plan editor.");
      window.location.href = "plan.html";
      return;
    }

    const plan = planSnap.data();

    // Determine targets
    let targetKey = "";
    let displayName = "";

    if (planType === "slots") {
      const slotNum = (currentSlotIndex % slotsCount) + 1;
      targetKey = `Slot ${slotNum}`;
      displayName = `Workout Slot ${slotNum}`;
    } else {
      targetKey = new Date().toLocaleDateString("en-US", { weekday: "long" });
      displayName = targetKey;
    }

    if (!plan[targetKey] || !plan[targetKey].exercises || plan[targetKey].type === "Rest") {
      loadEmptyCustomWorkout();
      const routineSelect = document.getElementById("workout-routine-select");
      if (routineSelect) {
        routineSelect.value = "today";
        refreshCustomDropdown(routineSelect);
      }
      return;
    }

    // Split exercises and parse them
    rawExercises = plan[targetKey].exercises.split(",").map(e => e.trim()).filter(Boolean);
    exercisesList = rawExercises.map(parseExercise);

    if (isResume) {
      const savedState = localStorage.getItem(`activeWorkoutState_${userUID}`);
      if (savedState) {
        const state = JSON.parse(savedState);
        currentExIndex = state.currentExIndex;
        currentExerciseSets = state.currentExerciseSets;
        loggedWorkoutLogs = state.loggedWorkoutLogs;
        
        // Restore exercisesList if it was saved, otherwise fallback
        if (state.exercisesList) {
          exercisesList = state.exercisesList;
        }
        
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
  if (exercisesList.length === 0 || currentExIndex >= exercisesList.length) {
    showWorkoutCompleteScreen();
    renderQueueList();
    return;
  }

  const ex = exercisesList[currentExIndex];
  exerciseNameEl.textContent = ex.name;
  exerciseTargetEl.textContent = `Target: ${ex.instruction}`;
  
  // Progress Indicators
  const processedCount = exercisesList.filter(e => e.status === "completed" || e.status === "skipped").length;
  const progressPercent = exercisesList.length > 0 ? (processedCount / exercisesList.length) * 100 : 0;
  const progressNum = Math.min(exercisesList.length, processedCount + 1);
  progressTextEl.textContent = `Exercise ${progressNum} of ${exercisesList.length}`;
  progressBarEl.style.width = `${progressPercent}%`;

  // Reset button visibilities
  nextExBtn.style.display = "none";
  finishWorkoutBtn.style.display = "none";

  renderQueueList();

  currentExerciseSets = ex.sets || [];

  renderSetsTable();

  // If no sets are completed yet and it's a fresh load (not isResume)
  const hasAnyCompleted = currentExerciseSets.some(s => s.completed);
  if (!hasAnyCompleted && !isResume) {
    // Trigger autofill weights check from logs history
    getAutofillWeights(ex.name).then(suggestedWeights => {
      if (suggestedWeights) {
        suggestedWeights.forEach((w, idx) => {
          if (currentExerciseSets[idx]) {
            currentExerciseSets[idx].weight = w;
          }
        });
        renderSetsTable();
        if (suggestedWeights.some(w => w)) {
          if (window.showToast) window.showToast("💡 Weights autofilled from history!", "info");
        }
      }
    });
  }
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
      <div style="display:flex; justify-content:center;">
        <button type="button" class="delete-set-btn" data-idx="${idx}" style="background:none; border:none; color:var(--color-danger); font-size:16px; cursor:pointer; display:flex; align-items:center; justify-content:center;">🗑️</button>
      </div>
    `;
    setsContainer.appendChild(row);

    const checkbox = row.querySelector(".set-checkbox");
    const weightInput = row.querySelector(`#weight-${idx}`);
    const repsInput = row.querySelector(`#reps-${idx}`);
    const deleteBtn = row.querySelector(".delete-set-btn");

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

    deleteBtn.addEventListener("click", () => {
      // Remove set
      currentExerciseSets.splice(idx, 1);
      // Re-index sets
      currentExerciseSets.forEach((setObj, i) => {
        setObj.set = i + 1;
      });
      saveSessionProgress();
      renderSetsTable();
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
    reps: ex ? ex.defaultReps : 10,
    completed: false
  });
  renderSetsTable();
  saveSessionProgress();
});

skipExBtn.addEventListener("click", () => {
  if (confirm("⏭️ Are you sure you want to skip this exercise?")) {
    if (currentExIndex < exercisesList.length) {
      exercisesList[currentExIndex].status = "skipped";
    }

    // Find next pending exercise
    const nextPendingIdx = exercisesList.findIndex((ex, idx) => idx > currentExIndex && ex.status === "pending");
    if (nextPendingIdx !== -1) {
      currentExIndex = nextPendingIdx;
    } else {
      const firstPendingIdx = exercisesList.findIndex(ex => ex.status === "pending");
      if (firstPendingIdx !== -1) {
        currentExIndex = firstPendingIdx;
      } else {
        currentExIndex = exercisesList.length;
      }
    }

    saveSessionProgress();
    renderCurrentExercise();
  }
});

// Check if all sets are marked complete
function checkExerciseCompletion() {
  if (exercisesList.length === 0 || currentExIndex >= exercisesList.length) return;
  const ex = exercisesList[currentExIndex];
  const allDone = currentExerciseSets.length > 0 && currentExerciseSets.every(s => s.completed);
  if (allDone) {
    const loggedIdx = loggedWorkoutLogs.findIndex(log => log.workout.toLowerCase() === ex.name.toLowerCase());
    const logEntry = {
      workout: ex.name,
      sets: currentExerciseSets.map(s => ({ set: s.set, weight: s.weight, reps: s.reps }))
    };

    if (loggedIdx >= 0) {
      loggedWorkoutLogs[loggedIdx] = logEntry;
    } else {
      loggedWorkoutLogs.push(logEntry);
    }

    // Check if all exercises are processed (completed or skipped)
    const allProcessed = exercisesList.every((e, idx) => idx === currentExIndex || e.status === "completed" || e.status === "skipped");
    if (allProcessed) {
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
  if (currentExIndex < exercisesList.length) {
    exercisesList[currentExIndex].status = "completed";
  }

  // Find next pending exercise
  const nextPendingIdx = exercisesList.findIndex((ex, idx) => idx > currentExIndex && ex.status === "pending");
  if (nextPendingIdx !== -1) {
    currentExIndex = nextPendingIdx;
  } else {
    const firstPendingIdx = exercisesList.findIndex(ex => ex.status === "pending");
    if (firstPendingIdx !== -1) {
      currentExIndex = firstPendingIdx;
    } else {
      currentExIndex = exercisesList.length;
    }
  }

  saveSessionProgress();
  renderCurrentExercise();
});

// === ⏱️ 6. Circular Rest Timer Controls ===
function startRestTimer(durationSeconds) {
  clearInterval(timerInterval);
  timerTotalTime = durationSeconds;
  timerTimeLeft = durationSeconds;
  
  const nextEx = exercisesList[currentExIndex];
  timerExerciseNameEl.textContent = nextEx ? `Up next: Set ${getPendingSetNumber()} of ${nextEx.name}` : "Resting...";

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
      if (ex) {
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
