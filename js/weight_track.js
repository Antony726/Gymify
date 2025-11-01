import { db, auth } from "./firebase-config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

async function loadProgress(user) {
  try {
    // ✅ Correct collection path
    const logsRef = collection(db, "users", user.uid, "logs");
    const snapshot = await getDocs(logsRef);

    const tbody = document.querySelector("#recordsBody");

    if (!tbody) {
      console.error("⚠️ Table body element not found.");
      return;
    }

    if (snapshot.empty) {
      console.warn("⚠️ No workout logs found.");
      tbody.innerHTML = "<tr><td colspan='3'>No records found. Log a workout first!</td></tr>";
      return;
    }

    const bestRecords = {};

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (!data.workout || !data.sets) return;

      const exercise = data.workout;
      const maxWeight = Math.max(...data.sets.map((s) => s.weight || 0));

      // 🏆 Keep highest weight record
      if (!bestRecords[exercise] || maxWeight > bestRecords[exercise].weight) {
        bestRecords[exercise] = {
          weight: maxWeight,
          date: data.date,
        };
      }
    });

    tbody.innerHTML = "";

    Object.entries(bestRecords).forEach(([exercise, record]) => {
      tbody.innerHTML += `
        <tr>
          <td>${exercise}</td>
          <td>${record.weight} kg</td>
          <td>${record.date}</td>
        </tr>`;
    });

    if (Object.keys(bestRecords).length === 0) {
      tbody.innerHTML = "<tr><td colspan='3'>No valid records found yet.</td></tr>";
    }

  } catch (err) {
    console.error("⚠️ Error loading records:", err);
  }
}

onAuthStateChanged(auth, (user) => {
  if (user) loadProgress(user);
  else window.location.href = "index.html";
});
