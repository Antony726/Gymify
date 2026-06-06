// js/navigation.js
import { auth } from "./firebase-config.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

// === ⏳ Reusable Gymify Loader System ===
window.GymifyLoader = {
  element: null,
  timeoutId: null,
  startTime: 0,
  isLongLoad: false,

  init() {
    if (this.element) return;
    
    // Create loader container
    const loader = document.createElement("div");
    loader.id = "gymify-global-loader";
    loader.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(9, 13, 22, 0.82);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      z-index: 999999;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.4s ease, background 0.4s ease, backdrop-filter 0.4s ease;
    `;
    
    loader.innerHTML = `
      <div style="text-align: center; padding: 20px;">
        <!-- Pulsing Gym Icon -->
        <div class="loader-gym-icon">🏋️‍♂️</div>
        
        <!-- Elegant Spinner Ring -->
        <div class="loader-ring-container">
          <svg width="40" height="40" viewBox="0 0 50 50" style="animation: spin 1.2s linear infinite;">
            <circle cx="25" cy="25" r="20" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="4"></circle>
            <circle cx="25" cy="25" r="20" fill="none" stroke="var(--color-accent)" stroke-width="4" stroke-dasharray="125" stroke-dashoffset="40" stroke-linecap="round"></circle>
          </svg>
        </div>
        
        <!-- Details block (shown ONLY for long durations > 800ms) -->
        <div class="loader-details" style="display: none; opacity: 0; transition: all 0.4s ease;">
          <!-- Progress bar container -->
          <div style="width: 220px; height: 6px; background: rgba(255,255,255,0.06); border-radius: 10px; overflow: hidden; margin: 25px auto 15px auto; border: 1px solid var(--border-color);">
            <div class="loader-progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, var(--color-accent), var(--color-success)); border-radius: 10px; transition: width 0.2s ease;"></div>
          </div>
          <!-- Status message -->
          <p class="loader-text" style="color: var(--text-secondary); font-size: 13px; font-weight: 500; letter-spacing: 0.02em; text-shadow: 0 2px 4px rgba(0,0,0,0.5);">Connecting to Gymify...</p>
        </div>
      </div>
    `;
    
    document.body.appendChild(loader);
    this.element = loader;
  },

  show(statusText = "Loading...") {
    this.init();
    clearTimeout(this.timeoutId);
    this.startTime = Date.now();
    this.isLongLoad = false;

    // Reset styles for Fast/Small Loader
    this.element.style.background = "rgba(9, 13, 22, 0.82)";
    this.element.style.backdropFilter = "blur(8px)";
    this.element.style.webkitBackdropFilter = "blur(8px)";
    this.element.style.display = "flex";
    this.element.style.opacity = "0";

    const details = this.element.querySelector(".loader-details");
    details.style.display = "none";
    details.style.opacity = "0";

    const progressBar = this.element.querySelector(".loader-progress-bar");
    progressBar.style.width = "0%";

    const textEl = this.element.querySelector(".loader-text");
    textEl.textContent = statusText;

    // Trigger transition
    setTimeout(() => {
      if (this.element) this.element.style.opacity = "1";
    }, 10);

    // Timeout to transition to Long/Progress Loader after 800ms
    this.timeoutId = setTimeout(() => {
      this.isLongLoad = true;
      this.element.style.background = "rgba(9, 13, 22, 0.97)";
      this.element.style.backdropFilter = "blur(15px)";
      this.element.style.webkitBackdropFilter = "blur(15px)";
      
      details.style.display = "block";
      setTimeout(() => {
        details.style.opacity = "1";
      }, 20);

      // Start initial progress if not updated yet
      progressBar.style.width = "15%";
    }, 800);
  },

  setProgress(percentage, statusText) {
    this.init();
    
    // If setProgress is called, force transition to Long Loader state immediately
    if (!this.isLongLoad && percentage > 0 && percentage < 100) {
      this.isLongLoad = true;
      clearTimeout(this.timeoutId);
      this.element.style.background = "rgba(9, 13, 22, 0.97)";
      this.element.style.backdropFilter = "blur(15px)";
      this.element.style.webkitBackdropFilter = "blur(15px)";
      
      const details = this.element.querySelector(".loader-details");
      details.style.display = "block";
      details.style.opacity = "1";
    }

    const progressBar = this.element.querySelector(".loader-progress-bar");
    const textEl = this.element.querySelector(".loader-text");

    if (progressBar) progressBar.style.width = `${percentage}%`;
    if (textEl && statusText) textEl.textContent = statusText;
  },

  hide() {
    clearTimeout(this.timeoutId);
    if (!this.element) return;

    // If it was in progress-bar mode, show 100% first
    const progressBar = this.element.querySelector(".loader-progress-bar");
    if (this.isLongLoad && progressBar) {
      progressBar.style.width = "100%";
      const textEl = this.element.querySelector(".loader-text");
      if (textEl) textEl.textContent = "Ready!";
    }

    setTimeout(() => {
      this.element.style.opacity = "0";
      setTimeout(() => {
        this.element.style.display = "none";
      }, 400);
    }, this.isLongLoad ? 200 : 50); // Less delay if it was a fast load
  }
};

// === 💧 Reusable Toast Notification System ===
window.showToast = function(message, type = "info") {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 999999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    `;
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.style.cssText = `
    background: rgba(15, 23, 42, 0.9);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    color: #f8fafc;
    padding: 14px 22px;
    border-radius: 14px;
    border-left: 5px solid #06b6d4;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    font-family: 'Poppins', sans-serif;
    font-size: 14px;
    font-weight: 500;
    min-width: 280px;
    max-width: 380px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    pointer-events: auto;
    opacity: 0;
    transform: translateY(-20px);
    transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  `;

  if (type === "success") {
    toast.style.borderLeftColor = "#10b981";
  } else if (type === "error") {
    toast.style.borderLeftColor = "#f43f5e";
  } else if (type === "warning") {
    toast.style.borderLeftColor = "#f59e0b";
  }

  toast.innerHTML = `
    <span style="display:flex; align-items:center; gap:8px;">${message}</span>
    <button style="background:none; border:none; color:#64748b; cursor:pointer; font-size:16px; margin-left:12px; padding:0; line-height:1;">✕</button>
  `;

  toast.querySelector("button").addEventListener("click", () => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-20px)";
    setTimeout(() => toast.remove(), 300);
  });

  container.appendChild(toast);

  // Trigger animation
  setTimeout(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  }, 10);

  // Auto remove
  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-20px)";
      setTimeout(() => toast.remove(), 300);
    }
  }, 4500);
};

// === 🧭 Navigation Injection ===
document.addEventListener("DOMContentLoaded", () => {
  const publicPages = ["index.html", "login.html", "signup.html", "debug.html", "fix-user.html", "active-workout.html"];
  const isPublic = publicPages.some(page => window.location.pathname.includes(page)) 
                   || window.location.pathname === "/" 
                   || window.location.pathname === "" 
                   || window.location.pathname.endsWith("/Gymify/");

  if (isPublic) return;

  // 1. Create Bottom Navigation HTML
  const nav = document.createElement("nav");
  nav.className = "bottom-nav";
  nav.innerHTML = `
    <a href="dashboard.html" class="nav-item" id="nav-home">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
      <span>Home</span>
    </a>
    <a href="log.html" class="nav-item" id="nav-log">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
      <span>Log</span>
    </a>
    <a href="progress.html" class="nav-item" id="nav-stats">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
      <span>Activity</span>
    </a>
    <a href="friends.html" class="nav-item" id="nav-social">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
      <span>Social</span>
    </a>
    <div class="nav-item" id="nav-more">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
      <span>More</span>
    </div>
  `;
  document.body.appendChild(nav);

  // 2. Create Bottom Sheet Drawer HTML
  const sheet = document.createElement("div");
  sheet.className = "bottom-sheet";
  sheet.id = "more-sheet";
  sheet.innerHTML = `
    <div class="bottom-sheet-content">
      <div class="sheet-header">
        <h3>Menu Options</h3>
        <button class="back-btn" id="close-sheet-btn" style="padding: 6px 12px; border-radius: 8px;">✕ Close</button>
      </div>
      <div class="sheet-grid">
        <a href="plan.html" class="sheet-item">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          <span>Workout Plan</span>
        </a>
        <a href="body-heatmap.html" class="sheet-item">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor"><path d="M12 2a5 5 0 0 0-5 5v3a5 5 0 0 0 10 0V7a5 5 0 0 0-5-5z"></path><path d="M6 10h12v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10z"></path></svg>
          <span>Body Heatmap</span>
        </a>
        <a href="weight.html" class="sheet-item">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
          <span>Weight Chart</span>
        </a>
        <a href="weight_track.html" class="sheet-item">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
          <span>Personal Bests</span>
        </a>
        <a href="history.html" class="sheet-item">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          <span>Workout History</span>
        </a>
        <a href="leaderboard.html" class="sheet-item">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor"><path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M6 8H5a4 4 0 0 0 0 8h1"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34"></path><path d="M12 2a5 5 0 0 0-5 5v3c0 .87.31 1.66.82 2.28L12 17l4.18-4.72c.51-.62.82-1.41.82-2.28V7a5 5 0 0 0-5-5z"></path></svg>
          <span>Leaderboard</span>
        </a>
        <a href="mygym.html" class="sheet-item">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
          <span>My Gym</span>
        </a>
        <a href="community.html" class="sheet-item">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          <span>Challenges</span>
        </a>
        <a href="catch.html" class="sheet-item">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor"><rect x="2" y="6" width="20" height="12" rx="2"></rect><path d="M6 12h4M8 10v4M15 11h.01M18 13h.01"></path></svg>
          <span>Diet Ninja Game</span>
        </a>
        <a href="excuse.html" class="sheet-item">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          <span>Skip Excuse?</span>
        </a>
        <a href="rand.html" class="sheet-item">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>
          <span>Gym Videos</span>
        </a>
        <a href="kbase.html" class="sheet-item">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
          <span>Exercise Info</span>
        </a>
        <a href="profile.html" class="sheet-item">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
          <span>Edit Profile</span>
        </a>
        <a href="feedback.html" class="sheet-item">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
          <span>Feedback</span>
        </a>
        <div class="sheet-item logout-btn" id="sheet-logout-btn" style="background:rgba(244,63,94,0.1); border-color:rgba(244,63,94,0.3); color:#f43f5e;">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
          <span>Logout</span>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(sheet);

  // 3. Highlight Active Navigation Item Based on Path
  const currentPath = window.location.pathname;
  if (currentPath.includes("dashboard.html")) {
    document.getElementById("nav-home")?.classList.add("active");
  } else if (currentPath.includes("log.html")) {
    document.getElementById("nav-log")?.classList.add("active");
  } else if (currentPath.includes("progress.html") || currentPath.includes("weight.html") || currentPath.includes("body-heatmap.html") || currentPath.includes("weight_track.html") || currentPath.includes("history.html")) {
    document.getElementById("nav-stats")?.classList.add("active");
  } else if (currentPath.includes("friends.html") || currentPath.includes("leaderboard.html") || currentPath.includes("mygym.html") || currentPath.includes("community.html") || currentPath.includes("friend-profile.html")) {
    document.getElementById("nav-social")?.classList.add("active");
  }

  // 4. Open/Close Bottom Sheet Trigger
  const moreBtn = document.getElementById("nav-more");
  const moreSheet = document.getElementById("more-sheet");
  const closeSheetBtn = document.getElementById("close-sheet-btn");

  if (moreBtn && moreSheet) {
    moreBtn.addEventListener("click", () => {
      moreSheet.style.display = "flex";
      setTimeout(() => moreSheet.classList.add("show"), 10);
    });

    const closeSheet = () => {
      moreSheet.classList.remove("show");
      setTimeout(() => moreSheet.style.display = "none", 300);
    };

    closeSheetBtn?.addEventListener("click", closeSheet);
    
    // Close on backdrop click
    moreSheet.addEventListener("click", (e) => {
      if (e.target === moreSheet) closeSheet();
    });
  }

  // 5. Drawer Logout Action
  const sheetLogoutBtn = document.getElementById("sheet-logout-btn");
  if (sheetLogoutBtn) {
    sheetLogoutBtn.addEventListener("click", async () => {
      if (confirm("🚪 Are you sure you want to logout?")) {
        try {
          await signOut(auth);
          window.location.href = "login.html";
        } catch (err) {
          console.error("Signout failed:", err);
          window.showToast("❌ Logout failed", "error");
        }
      }
    });
  }
});
