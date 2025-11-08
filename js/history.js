import { auth, db } from "./firebase-config.js";
import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

const historyContainer = document.getElementById("history-container");
const backBtn = document.getElementById("back-btn");
const downloadBtn = document.getElementById("download-pdf-btn");

backBtn.addEventListener("click", () => {
  window.location.href = "dashboard.html";
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  try {
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

      const formattedDate = data.date || new Date(data.timestamp?.toDate()).toLocaleDateString();

      logDiv.innerHTML = `
        <strong>${formattedDate}</strong> - <em>${data.workout}</em><br>
        🏋️‍♂️ ${data.sets?.map((s) => `Set ${s.set}: ${s.reps} reps × ${s.weight} kg`).join("<br>") || "No set data"}
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

downloadBtn.addEventListener("click", () => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const logs = historyContainer.querySelectorAll(".log-entry");
  if (logs.length === 0) {
    alert("No logs to export!");
    return;
  }

  let y = 20;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Gymify Workout History", 20, 15);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);

  logs.forEach((logDiv) => {
    // Replace emojis before adding
    const text = logDiv.innerText
      .replaceAll("🏋️‍♂️", "Workout:")
      .replaceAll("📝", "Notes:")
      .split("\n");

    text.forEach((line) => {
      if (y > 280) {
        doc.addPage();
        y = 20;
      }
      doc.text(line, 20, y);
      y += 7;
    });
    y += 5;
  });

  doc.save("Gymify_Workout_History.pdf");
});

