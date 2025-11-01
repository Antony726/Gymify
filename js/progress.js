import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// Firebase setup
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const logsRef = collection(db, "users", user.uid, "logs");
  const logsSnap = await getDocs(logsRef);

  const dailyXP = {};

  logsSnap.forEach((doc) => {
    const data = doc.data();
    if (data.date) {
      if (!dailyXP[data.date]) dailyXP[data.date] = 0;
      dailyXP[data.date] += 10; // each log = +10 XP
    }
  });

  // Sort by date
  const dates = Object.keys(dailyXP).sort();
  const xpValues = dates.map((d) => dailyXP[d]);

  // Chart.js
  const ctx = document.getElementById("progressChart").getContext("2d");
  new Chart(ctx, {
    type: "bar",
    data: {
      labels: dates,
      datasets: [{
        label: "Daily XP",
        data: xpValues,
        borderWidth: 2
      }]
    },
    options: {
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
});
