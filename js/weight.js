import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// 🔥 Initialize Firebase
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

  const dailyWeights = {};

  logsSnap.forEach((doc) => {
    const data = doc.data();
    if (data.date && Array.isArray(data.sets)) {
      let totalLifted = 0;
      data.sets.forEach((s) => {
        if (s.reps && s.weight) totalLifted += s.reps * s.weight;
      });

      // Add total lifted weight for that date
      if (!dailyWeights[data.date]) dailyWeights[data.date] = 0;
      dailyWeights[data.date] += totalLifted;
    }
  });

  // Sort dates
  const dates = Object.keys(dailyWeights).sort();
  const liftedValues = dates.map((d) => dailyWeights[d]);

  if (dates.length === 0) {
    alert("No workout data found! Log some workouts first 💪");
    return;
  }

  // 🧮 Calculate improvements (optional)
  const improvement = liftedValues[liftedValues.length - 1] - liftedValues[0];
  console.log(`Total improvement: ${improvement.toFixed(2)} kg lifted difference`);

  // 📊 Create chart
  const ctx = document.getElementById("progressChart").getContext("2d");
  new Chart(ctx, {
    type: "line",
    data: {
      labels: dates,
      datasets: [{
        label: "Total Weight Lifted (kg)",
        data: liftedValues,
        borderColor: "rgb(75, 192, 192)",
        backgroundColor: "rgba(75, 192, 192, 0.2)",
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: "Daily Total Weight Lifted (kg)"
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.parsed.y.toFixed(2)} kg lifted`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: "Total Weight (kg)"
          }
        },
        x: {
          title: {
            display: true,
            text: "Workout Date"
          }
        }
      }
    }
  });
});
