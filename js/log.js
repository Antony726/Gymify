import { auth, db } from "./firebase-config.js";
import {
  collection,
  addDoc,
  getDoc,
  doc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

const workoutInput = document.getElementById("workout-input");
const workoutDatalist = document.getElementById("workout-list");
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
    const todayName = new Date().toLocaleDateString("en-US", { weekday: "long" });
    
    // Arrays to store workouts
    const todayWorkouts = [];
    const otherWorkouts = [];

    for (const day in plan) {
      const workoutType = plan[day]?.type;
      const exercises = plan[day]?.exercises?.split(",") || [];

      exercises.forEach((exercise) => {
        const workoutValue = `${workoutType} - ${exercise.trim()}`;
        const displayText = `${day} - ${exercise.trim()}`;
        
        // Separate today's workouts from others
        if (day === todayName) {
          todayWorkouts.push({ value: workoutValue, text: displayText });
        } else {
          otherWorkouts.push({ value: workoutValue, text: displayText });
        }
      });
    }

    // 🎯 Add today's workouts FIRST, then others
    const allWorkouts = [...todayWorkouts, ...otherWorkouts];
    
    allWorkouts.forEach((workout) => {
      const opt = document.createElement("option");
      opt.value = workout.value;
      opt.textContent = workout.text;
      workoutDatalist.appendChild(opt);
    });

    // Pre-fill input with first today's workout if available
    if (todayWorkouts.length > 0) {
      workoutInput.placeholder = `Today: ${todayWorkouts[0].text}`;
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

  const selectedWorkout = workoutInput.value.trim();
  if (!selectedWorkout) {
    return alert("Please select or enter a workout!");
  }

  const date = dateInput.value;
  const notes = document.getElementById("notes").value;

  const sets = [
    {
      set: 1,
      reps: parseInt(document.getElementById("set1-reps").value) || 0,
      weight: parseFloat(document.getElementById("set1-weight").value) || 0,
    },
    {
      set: 2,
      reps: parseInt(document.getElementById("set2-reps").value) || 0,
      weight: parseFloat(document.getElementById("set2-weight").value) || 0,
    },
    {
      set: 3,
      reps: parseInt(document.getElementById("set3-reps").value) || 0,
      weight: parseFloat(document.getElementById("set3-weight").value) || 0,
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

    // ⭐ XP + 🔥 Streak + ❤️ Heart update
    const statsRef = doc(db, "users", user.uid, "data", "stats");
    const statsSnap = await getDoc(statsRef);

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    let xp = 0;
    let streak = 0;
    let hearts = 4;
    let lostHeart = false;
    let resetXP = false;

    // 🧮 XP calculation: base + per weight
    let gainedXP = 0;
    sets.forEach((s) => {
      gainedXP += 5 + Math.floor(s.weight / 5);
    });

    if (statsSnap.exists()) {
      const data = statsSnap.data();
      xp = data.xp || 0;
      hearts = data.hearts !== undefined ? data.hearts : 4;
      
      const lastLogDate = data.lastLogDate || "";
      
      if (lastLogDate) {
        const lastDate = new Date(lastLogDate + "T00:00:00"); // Force midnight time
        const todayDate = new Date(todayStr + "T00:00:00"); // Force midnight time
        const diffDays = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24));

        console.log(`📅 Last log: ${lastLogDate}, Today: ${todayStr}, Days difference: ${diffDays}`);

        if (diffDays === 0) {
          // ✅ Logged again same day — no streak change, just add XP
          streak = data.streak || 0;
          xp += gainedXP;
          console.log("✅ Same day log - no streak change");
        } else if (diffDays === 1) {
          // ✅ Logged next day — increment streak by 1
          const currentStreak = data.streak || 0;
          // If streak was 0 (broken), start fresh at 1
          // If streak was already going, increment it
          streak = currentStreak === 0 ? 1 : currentStreak + 1;
          xp += gainedXP;
          console.log(`✅ Next day log - streak: ${currentStreak} → ${streak}`);
        } else if (diffDays > 1) {
          // ❌ Missed days — RESET STREAK TO 0 & LOSE HEART
          console.log(`⚠️ Streak broken! Missed ${diffDays} days.`);
          
          // First set streak to 0 and lose heart
          streak = 0;
          hearts = Math.max(0, hearts - 1);
          lostHeart = true;

          // 💀 If all hearts lost — RESET XP TO 0
          if (hearts === 0) {
            console.log("💀 All hearts lost! Resetting XP to 0.");
            xp = 0;
            hearts = 4;
            resetXP = true;
            
            // Save the broken state first (streak = 0, hearts reset)
            await setDoc(statsRef, {
              xp: 0,
              streak: 0,
              hearts: 4,
              lastLogDate: todayStr,
              lastWorkoutWasRest: selectedWorkout.toLowerCase().includes("rest"),
            });
            
            alert("💀 All hearts lost! Your XP has been reset to 0. Streak is now 0. You've been given 4 hearts to start fresh!");
            
            statusDiv.textContent = "💀 All hearts lost! XP and streak reset. Fresh start!";
            statusDiv.style.color = "red";
            logForm.reset();
            dateInput.value = todayISO;
            localStorage.setItem("refreshDashboardWorkout", "true");
            
            setTimeout(() => {
              window.location.href = "dashboard.html";
            }, 2500);
            return; // Exit early
          } else {
            xp += gainedXP;
            alert(`💔 You missed ${diffDays} days! Streak reset to 0 and you lost 1 heart. You have ${hearts} hearts remaining.`);
          }
        }
      } else {
        // First workout ever
        streak = 1;
        xp += gainedXP;
        console.log("🎉 First workout ever! Starting streak at 1");
      }
    } else {
      // Brand new user
      streak = 1;
      xp = gainedXP;
      console.log("🎉 Brand new user! Starting streak at 1");
    }

    console.log(`📊 Final values - XP: ${xp}, Streak: ${streak}, Hearts: ${hearts}`);

    // 💾 Save updated stats
    await setDoc(statsRef, {
      xp,
      streak,
      hearts,
      lastLogDate: todayStr,
      lastWorkoutWasRest: selectedWorkout.toLowerCase().includes("rest"),
    });

    // 🏆 Update leaderboard entry
    try {
      const profileRef = doc(db, "users", user.uid, "data", "profile");
      const profileSnap = await getDoc(profileRef);
      const username = profileSnap.exists() 
        ? profileSnap.data().username 
        : user.displayName || user.email || "Anonymous";
      
      const leaderboardRef = doc(db, "leaderboard", user.uid);
      await setDoc(leaderboardRef, {
        username,
        xp,
        streak,
        updatedAt: new Date().toISOString()
      });
    } catch (leaderboardErr) {
      console.warn("⚠️ Could not update leaderboard:", leaderboardErr);
    }

    // ✅ Success message
    if (resetXP) {
      statusDiv.textContent = "💀 Workout logged! XP was reset to 0 due to losing all hearts. Fresh start!";
    } else if (lostHeart) {
      statusDiv.textContent = `💔 Workout logged! You lost 1 heart (${hearts} remaining). XP gained: +${gainedXP}`;
    } else {
      statusDiv.textContent = `✅ Workout logged! XP gained: +${gainedXP}. Streak: ${streak} days!`;
    }
    statusDiv.style.color = lostHeart || resetXP ? "orange" : "green";
    
    logForm.reset();
    dateInput.value = todayISO;

    // 🟢 Tell dashboard to refresh workout section
    localStorage.setItem("refreshDashboardWorkout", "true");

    // 🔁 Redirect to dashboard
    setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 2000);

  } catch (err) {
    console.error("🔥 Error logging workout:", err);
    statusDiv.textContent = "❌ Error logging workout.";
    statusDiv.style.color = "red";
  }
});