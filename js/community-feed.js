import {
  collection, getDocs, query, orderBy, limit, doc, getDoc,
  setDoc, deleteDoc, addDoc, serverTimestamp, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

let feedUnsubscribe = null;
const commentUnsubs = new Map();

export function timeAgo(ts) {
  if (!ts) return "Just now";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderFeedCard(p, options = {}) {
  const { compact = false } = options;
  const postId = escapeHtml(p.id);
  const cheerCount = p._cheerCount ?? 0;
  const commentCount = p._commentCount ?? 0;
  const userCheered = p._userCheered ?? false;
  const cardClass = p.type === "pr" ? "pr-card" : p.type === "plan" ? "plan-card" : "";
  const badge = p.type === "pr"
    ? `<span class="feed-badge pr">🏆 PR</span>`
    : p.type === "plan"
      ? `<span class="feed-badge plan">📋 Plan</span>`
      : p.type === "post"
        ? `<span class="feed-badge update">💬 Update</span>`
        : "";
  const avatar = p.avatar ? `assets/avatars/${p.avatar}` : "assets/avatars/avatar1.jpg";
  const planCode = p.metadata?.planCode && !compact
    ? `<button class="btn btn-sm btn-secondary copy-plan-btn" data-code="${encodeURIComponent(p.metadata.planCode)}" style="margin-top:10px;font-size:11px;">📋 Copy Plan Code</button>`
    : "";
  const profileHref = p.userId
    ? `friend-profile.html?id=${encodeURIComponent(p.userId)}`
    : null;

  return `
    <article class="feed-card ${cardClass}" data-post-id="${postId}">
      <div class="feed-header">
        ${profileHref
          ? `<a href="${profileHref}" class="feed-avatar-link"><img src="${avatar}" alt="" class="feed-avatar"></a>`
          : `<img src="${avatar}" alt="" class="feed-avatar">`}
        <div class="feed-header-text">
          ${profileHref
            ? `<a href="${profileHref}" class="feed-name feed-name-link">${escapeHtml(p.username || "GymBro")}</a>`
            : `<div class="feed-name">${escapeHtml(p.username || "GymBro")}</div>`}
          <div class="feed-time">${timeAgo(p.timestamp)}</div>
        </div>
      </div>
      ${badge}
      <div class="feed-message">${escapeHtml(p.message || "")}</div>
      ${planCode}
      <div class="feed-actions">
        <button type="button" class="feed-action-btn cheer-btn${userCheered ? " cheered" : ""}" data-post-id="${postId}" aria-label="Cheer">
          👏 <span class="cheer-count">${cheerCount}</span>
        </button>
        <button type="button" class="feed-action-btn comment-toggle-btn" data-post-id="${postId}" aria-label="Comments">
          💬 <span class="comment-count">${commentCount}</span>
        </button>
      </div>
      <div class="feed-comments-panel" id="comments-panel-${postId}" hidden>
        <div class="comments-list" id="comments-list-${postId}"></div>
        <div class="comment-form">
          <input type="text" class="comment-input" id="comment-input-${postId}" maxlength="200" placeholder="Add a comment..." />
          <button type="button" class="btn btn-sm comment-send-btn" data-post-id="${postId}">Post</button>
        </div>
      </div>
    </article>`;
}

async function enrichPostsWithMeta(db, posts, currentUserId) {
  if (!posts.length) return posts;
  return Promise.all(posts.map(async (p) => {
    try {
      const [cheersSnap, commentsSnap] = await Promise.all([
        getDocs(collection(db, "communityFeed", p.id, "cheers")),
        getDocs(collection(db, "communityFeed", p.id, "comments")),
      ]);
      return {
        ...p,
        _cheerCount: cheersSnap.size,
        _commentCount: commentsSnap.size,
        _userCheered: currentUserId
          ? cheersSnap.docs.some((d) => d.id === currentUserId)
          : false,
      };
    } catch {
      return { ...p, _cheerCount: 0, _commentCount: 0, _userCheered: false };
    }
  }));
}

function renderPostsToContainer(containerEl, posts, options) {
  if (!containerEl) return;
  if (!posts.length) {
    containerEl.innerHTML = `<p class="text-center community-feed-status">${options.emptyMessage || "No posts yet."}</p>`;
    return;
  }
  containerEl.innerHTML = posts.map((p) => renderFeedCard(p, options)).join("");
}

export function bindFeedInteractions(containerEl, db, currentUserId, getProfile) {
  if (!containerEl || !currentUserId) return;

  containerEl.querySelectorAll(".copy-plan-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const code = decodeURIComponent(btn.dataset.code || "");
      await navigator.clipboard.writeText(code);
      window.showToast?.("Plan code copied! Paste in Plan → Import.", "success");
    });
  });

  containerEl.querySelectorAll(".cheer-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const postId = btn.dataset.postId;
      if (!postId) return;
      btn.disabled = true;
      try {
        const cheered = await toggleCheer(db, postId, currentUserId);
        const countEl = btn.querySelector(".cheer-count");
        const current = parseInt(countEl?.textContent || "0", 10);
        countEl.textContent = String(cheered ? current + 1 : Math.max(0, current - 1));
        btn.classList.toggle("cheered", cheered);
      } catch (err) {
        console.error(err);
        window.showToast?.("Could not cheer this post.", "error");
      } finally {
        btn.disabled = false;
      }
    });
  });

  containerEl.querySelectorAll(".comment-toggle-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const postId = btn.dataset.postId;
      const panel = document.getElementById(`comments-panel-${postId}`);
      if (!panel) return;
      const opening = panel.hidden;
      panel.hidden = !opening;
      if (opening) subscribeComments(db, postId);
    });
  });

  containerEl.querySelectorAll(".comment-send-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const postId = btn.dataset.postId;
      const input = document.getElementById(`comment-input-${postId}`);
      const text = input?.value.trim();
      if (!text) return;
      btn.disabled = true;
      try {
        const profile = await getProfile();
        await addComment(db, postId, {
          userId: currentUserId,
          username: profile.username || "GymBro",
          text,
        });
        if (input) input.value = "";
        const card = containerEl.querySelector(`[data-post-id="${postId}"]`);
        const countEl = card?.querySelector(".comment-count");
        if (countEl) countEl.textContent = String(parseInt(countEl.textContent || "0", 10) + 1);
      } catch (err) {
        console.error(err);
        window.showToast?.("Could not post comment.", "error");
      } finally {
        btn.disabled = false;
      }
    });
  });

  containerEl.querySelectorAll(".comment-input").forEach((input) => {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const postId = input.id.replace("comment-input-", "");
        containerEl.querySelector(`.comment-send-btn[data-post-id="${postId}"]`)?.click();
      }
    });
  });
}

function subscribeComments(db, postId) {
  if (commentUnsubs.has(postId)) return;
  const listEl = document.getElementById(`comments-list-${postId}`);
  if (!listEl) return;

  const q = query(
    collection(db, "communityFeed", postId, "comments"),
    orderBy("timestamp", "asc"),
    limit(30)
  );

  const unsub = onSnapshot(q, (snap) => {
    if (snap.empty) {
      listEl.innerHTML = `<p class="comments-empty">No comments yet — start the conversation!</p>`;
      return;
    }
    listEl.innerHTML = snap.docs.map((d) => {
      const c = d.data();
      return `
        <div class="comment-item">
          <span class="comment-author">${escapeHtml(c.username || "GymBro")}</span>
          <span class="comment-text">${escapeHtml(c.text || "")}</span>
          <span class="comment-time">${timeAgo(c.timestamp)}</span>
        </div>`;
    }).join("");
    listEl.scrollTop = listEl.scrollHeight;
  }, (err) => {
    console.error(err);
    listEl.innerHTML = `<p class="comments-empty comments-error">Could not load comments.</p>`;
  });

  commentUnsubs.set(postId, unsub);
}

export async function toggleCheer(db, postId, userId) {
  const cheerRef = doc(db, "communityFeed", postId, "cheers", userId);
  const snap = await getDoc(cheerRef);
  if (snap.exists()) {
    await deleteDoc(cheerRef);
    return false;
  }
  await setDoc(cheerRef, { userId, timestamp: serverTimestamp() });
  return true;
}

export async function addComment(db, postId, { userId, username, text }) {
  await addDoc(collection(db, "communityFeed", postId, "comments"), {
    userId,
    username: username || "GymBro",
    text,
    timestamp: serverTimestamp(),
  });
}

export function subscribeCommunityFeed(db, containerEl, options = {}) {
  const {
    filter = "all",
    maxItems = 40,
    currentUserId = null,
    getProfile = async () => ({}),
    emptyMessage = "No posts yet. Log a workout and hit a PR — it'll show up here! 🏆",
    loadingMessage = "Loading feed...",
    onPostsChange,
  } = options;

  if (feedUnsubscribe) feedUnsubscribe();

  if (!containerEl) return () => {};

  containerEl.innerHTML = `<p class="text-center community-feed-status">${loadingMessage}</p>`;

  const feedRef = collection(db, "communityFeed");
  const q = query(feedRef, orderBy("timestamp", "desc"), limit(maxItems));

  let enrichTimer = null;

  feedUnsubscribe = onSnapshot(q, (snap) => {
    clearTimeout(enrichTimer);
    enrichTimer = setTimeout(async () => {
      let posts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (filter !== "all") posts = posts.filter((p) => p.type === filter);

      if (!posts.length) {
        renderPostsToContainer(containerEl, [], { ...options, emptyMessage });
        onPostsChange?.([]);
        return;
      }

      posts = await enrichPostsWithMeta(db, posts, currentUserId);
      renderPostsToContainer(containerEl, posts, options);
      bindFeedInteractions(containerEl, db, currentUserId, getProfile);
      onPostsChange?.(posts);
    }, 150);
  }, (err) => {
    console.error(err);
    containerEl.innerHTML = `<p class="text-center community-feed-status community-feed-error">Failed to load feed.</p>`;
  });

  return () => {
    if (feedUnsubscribe) feedUnsubscribe();
    feedUnsubscribe = null;
    commentUnsubs.forEach((unsub) => unsub());
    commentUnsubs.clear();
  };
}

/** One-time load fallback */
export async function loadCommunityFeed(db, containerEl, options = {}) {
  const {
    filter = "all",
    maxItems = 40,
    currentUserId = null,
    getProfile = async () => ({}),
    emptyMessage = "No posts yet.",
    loadingMessage = "Loading feed...",
  } = options;

  if (!containerEl) return [];
  containerEl.innerHTML = `<p class="text-center community-feed-status">${loadingMessage}</p>`;

  try {
    const q = query(collection(db, "communityFeed"), orderBy("timestamp", "desc"), limit(maxItems));
    const snap = await getDocs(q);
    let posts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (filter !== "all") posts = posts.filter((p) => p.type === filter);
    if (!posts.length) {
      renderPostsToContainer(containerEl, [], { ...options, emptyMessage });
      return [];
    }
    posts = await enrichPostsWithMeta(db, posts, currentUserId);
    renderPostsToContainer(containerEl, posts, options);
    bindFeedInteractions(containerEl, db, currentUserId, getProfile);
    return posts;
  } catch (err) {
    console.error(err);
    containerEl.innerHTML = `<p class="text-center community-feed-status community-feed-error">Failed to load feed.</p>`;
    return [];
  }
}

export async function getCommunityProfile(db, userId) {
  const profileRef = doc(db, "users", userId, "data", "profile");
  const snap = await getDoc(profileRef);
  return snap.exists() ? snap.data() : {};
}

export async function countWorkoutsThisWeek(db, userId) {
  const { toLocalDateStr, addDays } = await import("./streak-utils.js");
  const weekStart = addDays(toLocalDateStr(), -6);
  const logsRef = collection(db, "users", userId, "logs");
  const snap = await getDocs(logsRef);
  const days = new Set();
  snap.forEach((docSnap) => {
    const date = docSnap.data().date?.split("T")[0];
    if (date && date >= weekStart) days.add(date);
  });
  return days.size;
}

export async function getUserStreak(db, userId) {
  const statsRef = doc(db, "users", userId, "data", "stats");
  const snap = await getDoc(statsRef);
  return snap.exists() ? snap.data().streak || 0 : 0;
}

export const COMMUNITY_CHALLENGES = [
  {
    id: "community-lift",
    title: "Community Lift Week",
    goal: "Log 3 workouts this week",
    target: 3,
    metric: "workouts",
  },
  {
    id: "community-streak",
    title: "Streak Squad",
    goal: "Reach a 5-day streak",
    target: 5,
    metric: "streak",
  },
];

export function bindFeedFilters(container, onFilter) {
  container?.querySelectorAll("[data-feed-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      container.querySelectorAll("[data-feed-filter]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      onFilter(btn.dataset.feedFilter);
    });
  });
}
