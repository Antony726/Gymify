import { auth, db } from "./firebase-config.js";
import {
  subscribeCommunityFeed,
  getCommunityProfile,
  bindFeedFilters,
} from "./community-feed.js";
import { postToCommunityFeed } from "./pr-utils.js";

let currentUser = null;
let activeFilter = "all";
let loaded = false;
let unsubscribeFeed = null;

export async function initSocialCommunityTab() {
  if (!auth.currentUser) return;
  currentUser = auth.currentUser;

  if (!loaded) {
    loaded = true;

    bindFeedFilters(document.getElementById("social-feed-filters"), (filter) => {
      activeFilter = filter;
      startLiveFeed();
    });

    const quickInput = document.getElementById("social-quick-post");
    const quickCount = document.getElementById("social-quick-char");
    quickInput?.addEventListener("input", () => {
      if (quickCount) quickCount.textContent = String(quickInput.value.length);
    });

    document.getElementById("social-quick-post-btn")?.addEventListener("click", async () => {
      const message = quickInput?.value.trim();
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
        if (quickInput) quickInput.value = "";
        if (quickCount) quickCount.textContent = "0";
        window.showToast?.("Posted to community!", "success");
      } catch (err) {
        console.error(err);
        window.showToast?.("Could not post.", "error");
      }
    });
    document.getElementById("social-refresh-feed-btn")?.addEventListener("click", () => {
      startLiveFeed();
      window.showToast?.("Feed reconnected", "success");
    });
  }

  startLiveFeed();
}

function startLiveFeed() {
  if (unsubscribeFeed) unsubscribeFeed();
  const feedList = document.getElementById("social-community-feed");
  unsubscribeFeed = subscribeCommunityFeed(db, feedList, {
    filter: activeFilter,
    maxItems: 15,
    compact: true,
    currentUserId: currentUser?.uid,
    getProfile: () => getCommunityProfile(db, currentUser.uid),
    emptyMessage: "No posts yet. Be the first to share a win! 💪",
    loadingMessage: "Connecting to live feed...",
    onPostsChange: () => {
      document.getElementById("social-live-indicator")?.classList.add("active");
    },
  });
}
