import { collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

/** Local calendar date as YYYY-MM-DD */
export function toLocalDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDateStr(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(dateStr, days) {
  const date = parseDateStr(dateStr);
  date.setDate(date.getDate() + days);
  return toLocalDateStr(date);
}

export function getWeekdayName(dateStr) {
  return parseDateStr(dateStr).toLocaleDateString("en-US", { weekday: "long" });
}

/** True when the user's plan marks this day as rest (or plan is missing). */
export function isRestDay(plan, dateStr) {
  if (!plan || Object.keys(plan).length === 0) return true;
  const dayPlan = plan[getWeekdayName(dateStr)];
  if (!dayPlan) return true;
  if (dayPlan.type === "Rest") return true;
  if (!dayPlan.exercises || !String(dayPlan.exercises).trim()) return true;
  return false;
}

export function enumerateDates(fromStr, toStr) {
  if (!fromStr || !toStr || fromStr > toStr) return [];
  const dates = [];
  let current = fromStr;
  while (current <= toStr) {
    dates.push(current);
    current = addDays(current, 1);
  }
  return dates;
}

export async function fetchLoggedDates(db, userId, fromStr, toStr) {
  const dates = new Set();
  if (!fromStr || !toStr || fromStr > toStr) return dates;

  const logsRef = collection(db, "users", userId, "logs");
  const snapshot = await getDocs(logsRef);
  snapshot.forEach((docSnap) => {
    const date = docSnap.data().date?.split("T")[0];
    if (date && date >= fromStr && date <= toStr) dates.add(date);
  });
  return dates;
}

/**
 * Apply penalties for missed workout days between streakCheckDate and throughDate (inclusive).
 * Rest days are skipped and never break the streak.
 */
export function evaluateMissedDays(stats, plan, loggedDates, throughDate) {
  const base = {
    xp: stats.xp || 0,
    streak: stats.streak || 0,
    hearts: stats.hearts !== undefined ? stats.hearts : 4,
    lastLogDate: stats.lastLogDate || "",
    streakCheckDate: stats.streakCheckDate || "",
  };

  if (!base.lastLogDate || !throughDate) {
    return { stats: base, missedDays: [], lostHeart: false, resetXP: false };
  }

  const startDate = base.streakCheckDate
    ? addDays(base.streakCheckDate, 1)
    : addDays(base.lastLogDate, 1);

  if (startDate > throughDate) {
    return { stats: base, missedDays: [], lostHeart: false, resetXP: false };
  }

  let { xp, streak, hearts } = base;
  const missedDays = [];
  let lostHeart = false;
  let resetXP = false;

  for (const day of enumerateDates(startDate, throughDate)) {
    if (isRestDay(plan, day)) continue;
    if (loggedDates.has(day)) continue;

    missedDays.push(day);
    streak = 0;
    hearts = Math.max(0, hearts - 1);
    lostHeart = true;

    if (hearts === 0) {
      xp = 0;
      hearts = 4;
      resetXP = true;
    }
  }

  return {
    stats: {
      ...base,
      xp,
      streak,
      hearts,
      streakCheckDate: throughDate,
    },
    missedDays,
    lostHeart,
    resetXP,
  };
}

/**
 * Process streak + hearts when a workout is logged.
 * - One streak increment max per calendar day
 * - Rest days in between do not break the streak
 * - Missed workout days reset streak and cost hearts
 */
export async function processWorkoutLogStats({
  db,
  userId,
  stats,
  plan,
  logDate,
  gainedXP = 0,
}) {
  let planType = "days";
  try {
    const persRef = doc(db, "users", userId, "data", "personalization");
    const persSnap = await getDoc(persRef);
    if (persSnap.exists()) {
      planType = persSnap.data().planType || "days";
    }
  } catch (err) {
    console.warn("Could not load planType in streak check:", err);
  }

  const normalizedLogDate = logDate.split("T")[0];
  let currentStats = {
    xp: stats.xp || 0,
    streak: stats.streak || 0,
    hearts: stats.hearts !== undefined ? stats.hearts : 4,
    lastLogDate: stats.lastLogDate || "",
    streakCheckDate: stats.streakCheckDate || "",
  };

  const throughDate = addDays(normalizedLogDate, -1);
  let missedResult = {
    stats: currentStats,
    missedDays: [],
    lostHeart: false,
    resetXP: false,
  };

  // Only calculate missed days if they are NOT on a day-free slot cycle
  if (planType !== "slots" && currentStats.lastLogDate && throughDate >= addDays(currentStats.lastLogDate, 0)) {
    const fromStr = currentStats.streakCheckDate
      ? addDays(currentStats.streakCheckDate, 1)
      : addDays(currentStats.lastLogDate, 1);

    if (fromStr <= throughDate) {
      const loggedDates = await fetchLoggedDates(db, userId, fromStr, throughDate);
      missedResult = evaluateMissedDays(currentStats, plan, loggedDates, throughDate);
      currentStats = missedResult.stats;
    }
  }

  const isSameDay = normalizedLogDate === currentStats.lastLogDate;
  let streak = currentStats.streak;

  if (!currentStats.lastLogDate) {
    streak = 1;
  } else if (isSameDay) {
    streak = currentStats.streak;
  } else if (missedResult.missedDays.length > 0) {
    streak = 1;
  } else {
    streak = currentStats.streak === 0 ? 1 : currentStats.streak + 1;
  }

  const lastLogDate =
    !currentStats.lastLogDate || normalizedLogDate >= currentStats.lastLogDate
      ? normalizedLogDate
      : currentStats.lastLogDate;

  const streakCheckDate =
    missedResult.stats.streakCheckDate || currentStats.streakCheckDate;

  return {
    xp: missedResult.resetXP ? 0 : currentStats.xp + gainedXP,
    streak: missedResult.resetXP ? 0 : streak,
    hearts: currentStats.hearts,
    lastLogDate,
    streakCheckDate,
    isSameDay,
    missedDays: missedResult.missedDays,
    lostHeart: missedResult.lostHeart,
    resetXP: missedResult.resetXP,
  };
}

/** Check missed workout days through yesterday when the dashboard loads. */
export async function processDailyStreakCheck({ db, userId, stats, plan }) {
  let planType = "days";
  try {
    const persRef = doc(db, "users", userId, "data", "personalization");
    const persSnap = await getDoc(persRef);
    if (persSnap.exists()) {
      planType = persSnap.data().planType || "days";
    }
  } catch (err) {
    console.warn("Could not check planType in daily streak check:", err);
  }

  const yesterday = addDays(toLocalDateStr(), -1);
  const currentStats = {
    xp: stats.xp || 0,
    streak: stats.streak || 0,
    hearts: stats.hearts !== undefined ? stats.hearts : 4,
    lastLogDate: stats.lastLogDate || "",
    streakCheckDate: stats.streakCheckDate || "",
  };

  // Skip penalties if they are in slot mode
  if (planType === "slots" || !currentStats.lastLogDate) {
    return { stats: currentStats, changed: false, missedDays: [], lostHeart: false, resetXP: false };
  }

  const fromStr = currentStats.streakCheckDate
    ? addDays(currentStats.streakCheckDate, 1)
    : addDays(currentStats.lastLogDate, 1);

  if (fromStr > yesterday) {
    return { stats: currentStats, changed: false, missedDays: [], lostHeart: false, resetXP: false };
  }

  const loggedDates = await fetchLoggedDates(db, userId, fromStr, yesterday);
  const missedResult = evaluateMissedDays(currentStats, plan, loggedDates, yesterday);

  return {
    stats: missedResult.stats,
    changed: missedResult.missedDays.length > 0,
    missedDays: missedResult.missedDays,
    lostHeart: missedResult.lostHeart,
    resetXP: missedResult.resetXP,
  };
}
