import { collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { toLocalDateStr, addDays } from "./streak-utils.js";
import { extractExerciseName } from "./pr-utils.js";

const MUSCLE_MAP = {
  bench: "Chest", press: "Chest", fly: "Chest", push: "Chest", dip: "Chest",
  row: "Back", pull: "Back", deadlift: "Back", lat: "Back",
  squat: "Legs", lunge: "Legs", leg: "Legs", calf: "Legs",
  curl: "Arms", tricep: "Arms", bicep: "Arms",
  shoulder: "Shoulders", raise: "Shoulders",
  plank: "Core", crunch: "Core", core: "Core",
  run: "Cardio", cardio: "Cardio",
};

function guessMuscle(exerciseName) {
  const lower = exerciseName.toLowerCase();
  for (const [key, muscle] of Object.entries(MUSCLE_MAP)) {
    if (lower.includes(key)) return muscle;
  }
  return "General";
}

export function getWeekRange(referenceDate = new Date()) {
  const end = toLocalDateStr(referenceDate);
  const start = addDays(end, -6);
  return { start, end };
}

export async function buildWeeklyRecap(db, userId) {
  const { start, end } = getWeekRange();
  const logsRef = collection(db, "users", userId, "logs");
  const snapshot = await getDocs(logsRef);

  const weekLogs = [];
  const muscleCounts = {};
  let weekXP = 0;

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const date = data.date?.split("T")[0];
    if (!date || date < start || date > end) return;
    weekLogs.push(data);
    const exercise = extractExerciseName(data.workout);
    const muscle = guessMuscle(exercise);
    muscleCounts[muscle] = (muscleCounts[muscle] || 0) + 1;
    (data.sets || []).forEach((s) => {
      weekXP += 5 + Math.floor((Number(s.weight) || 0) / 5);
    });
  });

  const uniqueDays = new Set(weekLogs.map((l) => l.date?.split("T")[0])).size;

  const statsRef = doc(db, "users", userId, "data", "stats");
  const statsSnap = await getDoc(statsRef);
  const streak = statsSnap.exists() ? statsSnap.data().streak || 0 : 0;
  const totalXP = statsSnap.exists() ? statsSnap.data().xp || 0 : 0;

  const profileRef = doc(db, "users", userId, "data", "profile");
  const profileSnap = await getDoc(profileRef);
  const username = profileSnap.exists() ? profileSnap.data().username : "GymBro";

  const topMuscle = Object.entries(muscleCounts).sort((a, b) => b[1] - a[1])[0];

  return {
    start,
    end,
    username,
    workoutsLogged: weekLogs.length,
    activeDays: uniqueDays,
    weekXP,
    totalXP,
    streak,
    topMuscle: topMuscle ? topMuscle[0] : "—",
    topMuscleCount: topMuscle ? topMuscle[1] : 0,
    muscleCounts,
  };
}

export function downloadWeeklyRecapPDF(recap) {
  if (!window.jspdf?.jsPDF) {
    window.showToast?.("PDF library not loaded", "warning");
    return;
  }

  const doc = new window.jspdf.jsPDF();
  let y = 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Gymify Weekly Recap", 20, y);
  y += 10;

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`${recap.start} to ${recap.end}`, 20, y);
  y += 12;

  doc.setFont("helvetica", "bold");
  doc.text(`Athlete: ${recap.username}`, 20, y);
  y += 10;

  doc.setFont("helvetica", "normal");
  const lines = [
    `Workouts logged: ${recap.workoutsLogged}`,
    `Active gym days: ${recap.activeDays}`,
    `XP earned this week: ${recap.weekXP}`,
    `Total XP: ${recap.totalXP}`,
    `Current streak: ${recap.streak} days`,
    `Most trained: ${recap.topMuscle} (${recap.topMuscleCount} sessions)`,
  ];

  lines.forEach((line) => {
    doc.text(line, 20, y);
    y += 8;
  });

  y += 6;
  doc.setFont("helvetica", "bold");
  doc.text("Muscle breakdown:", 20, y);
  y += 8;
  doc.setFont("helvetica", "normal");

  Object.entries(recap.muscleCounts).forEach(([muscle, count]) => {
    doc.text(`  ${muscle}: ${count}`, 20, y);
    y += 7;
  });

  doc.save(`Gymify_Recap_${recap.end}.pdf`);
}

export function shouldShowWeeklyRecap() {
  const key = "lastWeeklyRecapShown";
  const last = localStorage.getItem(key);
  const today = toLocalDateStr();
  if (last === today) return false;
  const day = new Date().getDay();
  if (day !== 1 && !last) {
    localStorage.setItem(key, today);
    return true;
  }
  if (day === 1 && last !== today) {
    localStorage.setItem(key, today);
    return true;
  }
  return false;
}
