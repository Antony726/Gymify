import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
  doc, getDoc, serverTimestamp, setDoc
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { postToCommunityFeed } from "./pr-utils.js";
import {
  subscribeCommunityFeed,
  getCommunityProfile,
  bindFeedFilters,
  COMMUNITY_CHALLENGES,
  countWorkoutsThisWeek,
  getUserStreak,
  escapeHtml,
} from "./community-feed.js";

let currentUser = null;
let activeFilter = "all";
let unsubscribeFeed = null;

document.querySelectorAll(".community-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".community-tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`pane-${tab.dataset.tab}`).classList.add("active");
  });
});

function startLiveFeed() {
  if (unsubscribeFeed) unsubscribeFeed();
  const feedList = document.getElementById("feed-list");
  unsubscribeFeed = subscribeCommunityFeed(db, feedList, {
    filter: activeFilter,
    maxItems: 40,
    currentUserId: currentUser?.uid,
    getProfile: () => getCommunityProfile(db, currentUser.uid),
    emptyMessage: "No posts yet. Log a workout and hit a PR — it'll show up here! 🏆",
    loadingMessage: "Connecting to live feed...",
    onPostsChange: (posts) => {
      const statEl = document.getElementById("feed-stat-count");
      if (statEl) statEl.textContent = String(posts.length);
      const liveEl = document.getElementById("live-feed-indicator");
      if (liveEl) liveEl.classList.add("active");
    },
  });
}

async function loadCommunityChallenges() {
  const list = document.getElementById("community-challenges-list");
  if (!list) return;

  const [workouts, streak] = await Promise.all([
    countWorkoutsThisWeek(db, currentUser.uid),
    getUserStreak(db, currentUser.uid),
  ]);

  list.innerHTML = await Promise.all(COMMUNITY_CHALLENGES.map(async (ch) => {
    const joinRef = doc(db, "communityChallenges", ch.id);
    const snap = await getDoc(joinRef);
    const members = snap.exists() ? snap.data().members || [] : [];
    const joined = members.includes(currentUser.uid);
    const memberCount = members.length;
    const progress = ch.metric === "workouts" ? workouts : streak;
    const pct = Math.min(100, Math.round((progress / ch.target) * 100));

    return `
      <div class="challenge-mini" id="ch-${ch.id}">
        <div class="challenge-mini-head">
          <div style="font-weight:700;color:#fff;font-size:14px;">${escapeHtml(ch.title)}</div>
          <span class="challenge-member-pill">${memberCount} joined</span>
        </div>
        <div style="font-size:12px;color:var(--text-secondary);margin:4px 0;">${escapeHtml(ch.goal)}</div>
        <div class="challenge-progress-label">Your progress: ${progress} / ${ch.target}</div>
        <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
        <button class="btn btn-sm challenge-join-btn" style="margin-top:8px;font-size:11px;"
          data-challenge="${ch.id}" ${joined ? "disabled" : ""}>
          ${joined ? "✅ Joined" : "Join Challenge"}
        </button>
      </div>`;
  })).then((html) => html.join(""));

  list.querySelectorAll(".challenge-join-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (btn.disabled) return;
      try {
        const id = btn.dataset.challenge;
        const joinRef = doc(db, "communityChallenges", id);
        const snap = await getDoc(joinRef);
        const members = snap.exists() ? snap.data().members || [] : [];
        if (!members.includes(currentUser.uid)) members.push(currentUser.uid);
        await setDoc(joinRef, {
          title: COMMUNITY_CHALLENGES.find((c) => c.id === id)?.title,
          members,
          updatedAt: serverTimestamp(),
        }, { merge: true });
        window.showToast?.("Joined challenge! 💪", "success");
        loadCommunityChallenges();
      } catch (err) {
        console.error(err);
        window.showToast?.("Could not join challenge.", "error");
      }
    });
  });
}

document.getElementById("refresh-feed-btn")?.addEventListener("click", () => {
  startLiveFeed();
  window.showToast?.("Feed reconnected", "success");
});

bindFeedFilters(document.getElementById("feed-filters"), (filter) => {
  activeFilter = filter;
  startLiveFeed();
});

const shareMessage = document.getElementById("share-message");
const charCount = document.getElementById("share-char-count");
shareMessage?.addEventListener("input", () => {
  if (charCount) charCount.textContent = String(shareMessage.value.length);
});

document.getElementById("share-plan-btn")?.addEventListener("click", async () => {
  if (!currentUser) return;
  try {
    const planRef = doc(db, "users", currentUser.uid, "data", "plan");
    const planSnap = await getDoc(planRef);
    if (!planSnap.exists()) {
      window.showToast?.("No workout plan found. Create one first!", "warning");
      return;
    }

    const plan = planSnap.data();
    const planCode = btoa(JSON.stringify(plan));
    const profile = await getCommunityProfile(db, currentUser.uid);
    const summary = Object.entries(plan)
      .filter(([, v]) => v.type !== "Rest")
      .map(([day, v]) => `${day.slice(0, 3)}: ${v.type}`)
      .join(" · ");

    await postToCommunityFeed(db, {
      userId: currentUser.uid,
      username: profile.username,
      avatar: profile.avatar,
      type: "plan",
      message: `📋 Shared my weekly split: ${summary}`,
      metadata: { planCode, planSummary: summary },
    });

    window.showToast?.("Plan shared to community feed!", "success");
    document.querySelector('[data-tab="feed"]')?.click();
  } catch (err) {
    console.error(err);
    window.showToast?.("Could not share plan.", "error");
  }
});

document.getElementById("share-post-btn")?.addEventListener("click", async () => {
  if (!currentUser) return;
  const message = shareMessage?.value.trim();
  if (!message) return window.showToast?.("Write something first!", "warning");
  if (message.length > 280) return window.showToast?.("Keep it under 280 characters.", "warning");

  try {
    const profile = await getCommunityProfile(db, currentUser.uid);
    await postToCommunityFeed(db, {
      userId: currentUser.uid,
      username: profile.username,
      avatar: profile.avatar,
      type: "post",
      message,
    });

    if (shareMessage) shareMessage.value = "";
    if (charCount) charCount.textContent = "0";
    window.showToast?.("Posted to feed!", "success");
    document.querySelector('[data-tab="feed"]')?.click();
  } catch (err) {
    console.error(err);
    window.showToast?.("Could not post.", "error");
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  currentUser = user;

  const urlTab = new URLSearchParams(window.location.search).get("tab");
  if (urlTab) {
    document.querySelector(`.community-tab[data-tab="${urlTab}"]`)?.click();
  }

  startLiveFeed();
  loadCommunityChallenges();
});
