import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// Firebase setup
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const calendarEl = document.getElementById("calendar");
const summaryEl = document.getElementById("summary");

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const logsRef = collection(db, "users", user.uid, "logs");
  const logsSnap = await getDocs(logsRef);

  const workoutDates = new Set();
  logsSnap.forEach(doc => {
    const data = doc.data();
    if (data.date) workoutDates.add(data.date);
  });

  const totalWorkoutDays = workoutDates.size;
  const totalDays = 60; // last 60 days
  const today = new Date();

  const days = [];
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
});
