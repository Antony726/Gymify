import { auth, db } from "./firebase-config.js";
import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

const historyContainer = document.getElementById("history-container");
const backBtn = document.getElementById("back-btn");

backBtn.addEventListener("click", () => {
  window.location.href = "dashboard.html";
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  try {
    // ✅ Fetch directly from users/<uid>/logs
    const logsRef = collection(db, "users", user.uid, "logs");
    const logsQuery = query(logsRef, orderBy("timestamp", "desc"));
    const logsSnapshot = await getDocs(logsQuery);

    historyContainer.innerHTML = "";

    if (logsSnapshot.empty) {
      historyContainer.innerHTML = `<p>No workout logs yet! 💤</p>`;
      return;
    }

    logsSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const logDiv = document.createElement("div");
      logDiv.className = "log-entry";

      // Format date
      const formattedDate = data.date || new Date(data.timestamp?.toDate()).toLocaleDateString();

      // Display each workout log
      logDiv.innerHTML = `
        <strong>${formattedDate}</strong> - <em>${data.workout}</em><br>
        🏋️‍♂️ ${data.sets
          ?.map((s) => `Set ${s.set}: ${s.reps} reps × ${s.weight} kg`)
          .join("<br>") || "No set data"}
        <br><br>
        📝 Notes: ${data.notes || "—"}
      `;

      historyContainer.appendChild(logDiv);
    });
  } catch (err) {
    console.error("🔥 Error loading history:", err);
    historyContainer.innerHTML = `<p>⚠️ Failed to load logs. ${err.message}</p>`;
  }
});
