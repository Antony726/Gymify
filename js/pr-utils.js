import { collection, getDocs, addDoc, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

export function extractExerciseName(workout) {
  if (!workout) return "Exercise";
  if (workout.includes(" - ")) return workout.split(" - ").pop().trim();
  return workout.trim();
}

export function getSetPeaks(sets = []) {
  let maxWeight = 0;
  let maxReps = 0;
  let bestVolume = 0;

  sets.forEach((s) => {
    const weight = Number(s.weight) || 0;
    const reps = Number(s.reps) || 0;
    if (weight > maxWeight) maxWeight = weight;
    if (reps > maxReps) maxReps = reps;
    const volume = weight * reps;
    if (volume > bestVolume) bestVolume = volume;
  });

  return { maxWeight, maxReps, bestVolume };
}

export async function getHistoricalBests(db, userId, exerciseName) {
  const logsRef = collection(db, "users", userId, "logs");
  const snapshot = await getDocs(logsRef);
  const key = exerciseName.toLowerCase();
  let maxWeight = 0;
  let maxReps = 0;

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const name = extractExerciseName(data.workout).toLowerCase();
    if (name !== key) return;
    const peaks = getSetPeaks(data.sets || []);
    if (peaks.maxWeight > maxWeight) maxWeight = peaks.maxWeight;
    if (peaks.maxReps > maxReps) maxReps = peaks.maxReps;
  });

  return { maxWeight, maxReps };
}

export async function detectPRs(db, userId, workout, sets) {
  const exerciseName = extractExerciseName(workout);
  const current = getSetPeaks(sets);
  const historical = await getHistoricalBests(db, userId, exerciseName);
  const prs = [];

  if (current.maxWeight > 0 && current.maxWeight > historical.maxWeight) {
    prs.push({
      exerciseName,
      type: "weight",
      value: current.maxWeight,
      previous: historical.maxWeight,
      label: `${current.maxWeight} kg`,
    });
  }

  if (current.maxReps > 0 && current.maxReps > historical.maxReps && current.maxWeight <= historical.maxWeight) {
    prs.push({
      exerciseName,
      type: "reps",
      value: current.maxReps,
      previous: historical.maxReps,
      label: `${current.maxReps} reps`,
    });
  }

  return prs;
}

export async function savePRBadge(db, userId, pr) {
  const badgeRef = doc(db, "users", userId, "data", "prBadges");
  const snap = await getDoc(badgeRef);
  const existing = snap.exists() ? snap.data().badges || [] : [];
  const badge = {
    exercise: pr.exerciseName,
    type: pr.type,
    value: pr.value,
    earnedAt: new Date().toISOString(),
  };
  existing.unshift(badge);
  await setDoc(badgeRef, { badges: existing.slice(0, 50) }, { merge: true });
}

export async function postToCommunityFeed(db, { userId, username, avatar, type, message, metadata = {} }) {
  await addDoc(collection(db, "communityFeed"), {
    userId,
    username: username || "GymBro",
    avatar: avatar || "avatar1.jpg",
    type,
    message,
    metadata,
    timestamp: serverTimestamp(),
    likes: 0,
  });
}

export async function announcePRs(db, userId, workout, sets) {
  const prs = await detectPRs(db, userId, workout, sets);
  if (prs.length === 0) return [];

  const profileRef = doc(db, "users", userId, "data", "profile");
  const profileSnap = await getDoc(profileRef);
  const profile = profileSnap.exists() ? profileSnap.data() : {};
  const username = profile.username || "GymBro";
  const avatar = profile.avatar || "avatar1.jpg";

  for (const pr of prs) {
    await savePRBadge(db, userId, pr);
    const prev = pr.previous > 0 ? ` (was ${pr.previous}${pr.type === "weight" ? " kg" : " reps"})` : "";
    await postToCommunityFeed(db, {
      userId,
      username,
      avatar,
      type: "pr",
      message: `🏆 New PR on ${pr.exerciseName}: ${pr.label}${prev}!`,
      metadata: { exercise: pr.exerciseName, prType: pr.type, value: pr.value, workout },
    });
  }

  return prs;
}

export function showPRCelebration(prs) {
  if (!prs?.length) return;

  const text = prs.map((p) => `🏆 ${p.exerciseName}: ${p.label}`).join("\n");
  if (window.showToast) {
    window.showToast(`NEW PR!\n${text}`, "success");
  }

  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 60000; pointer-events: none;
    display: flex; align-items: center; justify-content: center;
    background: rgba(9,13,22,0.5); animation: fadeOut 2.5s forwards;
  `;
  overlay.innerHTML = `
    <div style="text-align:center;padding:24px;background:rgba(13,21,37,0.95);border:2px solid #fbbf24;border-radius:20px;box-shadow:0 0 40px rgba(251,191,36,0.3);">
      <div style="font-size:48px;margin-bottom:8px;">🏆</div>
      <div style="font-size:18px;font-weight:800;color:#fbbf24;">NEW PERSONAL RECORD!</div>
      <div style="font-size:13px;color:#fff;margin-top:10px;line-height:1.5;">${prs.map((p) => `${p.exerciseName}: <b>${p.label}</b>`).join("<br>")}</div>
      <div style="font-size:11px;color:var(--text-secondary,#94a3b8);margin-top:8px;">Shared to Community Feed</div>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => overlay.remove(), 2600);

  for (let i = 0; i < 24; i++) {
    const piece = document.createElement("div");
    piece.textContent = ["🏆", "💪", "🔥", "⭐"][i % 4];
    piece.style.cssText = `
      position:fixed;left:${40 + Math.random() * 20}%;top:-20px;font-size:20px;
      z-index:60001;pointer-events:none;animation:confettiFall ${1.5 + Math.random()}s ease-in forwards;
    `;
    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), 2500);
  }

  if (!document.getElementById("pr-confetti-style")) {
    const style = document.createElement("style");
    style.id = "pr-confetti-style";
    style.textContent = `
      @keyframes confettiFall { to { transform: translateY(100vh) rotate(360deg); opacity: 0; } }
      @keyframes fadeOut { 0%,70% { opacity:1; } 100% { opacity:0; } }
    `;
    document.head.appendChild(style);
  }
}
