import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { getFirestore, collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// Firebase setup
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const calendarEl = document.getElementById("calendar");
const summaryEl = document.getElementById("summary");
const recordsBody = document.getElementById("recordsBody");
const latestHistoryContainer = document.getElementById("latest-history-container");

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  try {
    // 1. Fetch workout logs ordered by timestamp descending
    const logsRef = collection(db, "users", user.uid, "logs");
    const logsQuery = query(logsRef, orderBy("timestamp", "desc"));
    const logsSnap = await getDocs(logsQuery);

    const workoutDates = new Set();
    const bestRecords = {};
    const latestWorkouts = [];

    logsSnap.forEach(docSnap => {
      const data = docSnap.data();
      const dateStr = data.date;
      
      // Save date for the calendar
      if (dateStr) workoutDates.add(dateStr);

      // Process personal records
      if (data.workout && data.sets) {
        const exercise = data.workout;
        const maxWeight = Math.max(...data.sets.map(s => Number(s.weight) || 0));
        const formattedDate = dateStr || (data.timestamp ? new Date(data.timestamp.toDate()).toLocaleDateString() : "");

        if (!bestRecords[exercise] || maxWeight > bestRecords[exercise].weight) {
          bestRecords[exercise] = {
            weight: maxWeight,
            date: formattedDate
          };
        }
      }
    });

    // 2. Render 60-Day Consistency Calendar
    if (calendarEl && summaryEl) {
      calendarEl.innerHTML = "";
      const totalWorkoutDays = workoutDates.size;
      const totalDays = 60; // last 60 days
      const today = new Date();

      for (let i = totalDays - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];

        const dayDiv = document.createElement("div");
        dayDiv.classList.add("day");

        if (workoutDates.has(dateStr)) {
          dayDiv.classList.add("workout");
          dayDiv.title = `${dateStr} ✅ Workout`;
        } else {
          dayDiv.classList.add("rest");
          dayDiv.title = `${dateStr} 💤 Rest Day`;
        }

        calendarEl.appendChild(dayDiv);
      }

      summaryEl.textContent = `🏋️ Total Gym Days: ${totalWorkoutDays} / ${totalDays}`;
    }

    // 3. Render Personal Bests Table
    if (recordsBody) {
      recordsBody.innerHTML = "";
      const entries = Object.entries(bestRecords);

      if (entries.length === 0) {
        recordsBody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-secondary); padding:15px;">No records found yet. Log a workout first!</td></tr>`;
      } else {
        entries.forEach(([exercise, record]) => {
          recordsBody.innerHTML += `
            <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.04);">
              <td style="padding: 10px 4px; font-weight: 500; color: #fff;">${exercise}</td>
              <td style="padding: 10px 4px; color: var(--color-success); font-weight: 600;">${record.weight} kg</td>
              <td style="padding: 10px 4px; color: var(--text-secondary);">${record.date}</td>
            </tr>`;
        });
      }
    }

    // 4. Render Top 5 Latest Workouts
    if (latestHistoryContainer) {
      latestHistoryContainer.innerHTML = "";
      const docs = logsSnap.docs;
      const latestDocs = docs.slice(0, 5);

      if (latestDocs.length === 0) {
        latestHistoryContainer.innerHTML = `<p style="text-align:center; color:var(--text-secondary); padding: 15px; font-size: 13px;">No workouts logged yet. 💤</p>`;
      } else {
        latestDocs.forEach(docSnap => {
          const data = docSnap.data();
          const logDiv = document.createElement("div");
          logDiv.style.cssText = `
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 12px;
            margin-bottom: 10px;
            font-size: 13px;
          `;

          const formattedDate = data.date || (data.timestamp ? new Date(data.timestamp.toDate()).toLocaleDateString() : "");

          logDiv.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom: 6px;">
              <strong style="color:#fff;">${data.workout}</strong>
              <span style="color:var(--text-secondary); font-size:11px;">${formattedDate}</span>
            </div>
            <div style="color:var(--text-secondary); line-height: 1.4; padding-left: 8px; border-left: 2px solid rgba(255,255,255,0.1);">
              ${data.sets?.map(s => `Set ${s.set}: <b>${s.reps}</b> reps × <b>${s.weight}</b> kg`).join("<br>") || "No set data"}
            </div>
          `;
          latestHistoryContainer.appendChild(logDiv);
        });
      }
    }

  } catch (err) {
    console.error("🔥 Error loading progress analytics:", err);
    if (window.showToast) {
      window.showToast("⚠️ Failed to load progress analytics", "error");
    }
  }
});
