import {
  collection, doc, getDoc, getDocs, setDoc, query, where, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { toLocalDateStr, addDays } from "./streak-utils.js";

export async function createBuddyChallenge(db, { fromId, fromName, toId, toName, type, goal }) {
  const startDate = toLocalDateStr();
  const endDate = addDays(startDate, 6);
  const ref = doc(collection(db, "buddyChallenges"));
  await setDoc(ref, {
    from: fromId,
    to: toId,
    fromName,
    toName,
    type,
    goal: Number(goal),
    startDate,
    endDate,
    fromProgress: 0,
    toProgress: 0,
    status: "active",
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getActiveChallenges(db, userId) {
  const ref = collection(db, "buddyChallenges");
  const [asFrom, asTo] = await Promise.all([
    getDocs(query(ref, where("from", "==", userId), where("status", "==", "active"))),
    getDocs(query(ref, where("to", "==", userId), where("status", "==", "active"))),
  ]);

  const challenges = [];
  asFrom.forEach((d) => challenges.push({ id: d.id, ...d.data() }));
  asTo.forEach((d) => challenges.push({ id: d.id, ...d.data() }));
  return challenges;
}

async function countWorkoutsInRange(db, userId, startDate, endDate) {
  const logsRef = collection(db, "users", userId, "logs");
  const snap = await getDocs(logsRef);
  const days = new Set();
  snap.forEach((docSnap) => {
    const date = docSnap.data().date?.split("T")[0];
    if (date && date >= startDate && date <= endDate) days.add(date);
  });
  return days.size;
}

async function getXPInRange(db, userId, startDate, endDate) {
  const logsRef = collection(db, "users", userId, "logs");
  const snap = await getDocs(logsRef);
  let xp = 0;
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    const date = data.date?.split("T")[0];
    if (!date || date < startDate || date > endDate) return;
    (data.sets || []).forEach((s) => {
      xp += 5 + Math.floor((Number(s.weight) || 0) / 5);
    });
    xp += 10;
  });
  return xp;
}

export async function refreshBuddyChallengeProgress(db, userId) {
  const challenges = await getActiveChallenges(db, userId);
  const today = toLocalDateStr();

  for (const ch of challenges) {
    if (today > ch.endDate) {
      await setDoc(doc(db, "buddyChallenges", ch.id), { status: "completed" }, { merge: true });
      continue;
    }

    const fromProg = ch.type === "workouts"
      ? await countWorkoutsInRange(db, ch.from, ch.startDate, today)
      : await getXPInRange(db, ch.from, ch.startDate, today);

    const toProg = ch.type === "workouts"
      ? await countWorkoutsInRange(db, ch.to, ch.startDate, today)
      : await getXPInRange(db, ch.to, ch.startDate, today);

    await setDoc(doc(db, "buddyChallenges", ch.id), {
      fromProgress: fromProg,
      toProgress: toProg,
    }, { merge: true });
  }
}

export function getChallengeWinner(ch) {
  if (ch.fromProgress === ch.toProgress) return null;
  return ch.fromProgress > ch.toProgress ? ch.fromName : ch.toName;
}
