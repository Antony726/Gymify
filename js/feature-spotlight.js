const SPOTLIGHT_CHIPS = [
  { icon: "🌐", label: "Community", href: "friends.html?tab=community", tag: "LIVE" },
  { icon: "⚔️", label: "Challenges", href: "friends.html?tab=challenges" },
  { icon: "🏆", label: "Leaderboard", href: "leaderboard.html" },
  { icon: "📷", label: "Scan QR", href: "scan.html" },
  { icon: "🏋️", label: "My Gym", href: "mygym.html" },
  { icon: "📋", label: "Share Plan", href: "community.html?tab=share" },
  { icon: "🔥", label: "Body Map", href: "body-heatmap.html" },
  { icon: "📊", label: "Weekly Recap", href: "dashboard.html" },
];

const DAILY_TIPS = [
  "👏 Cheer a friend's PR in Community — it only takes a tap!",
  "⚔️ Challenge a gym buddy to a 7-day workout duel.",
  "📋 Share your split — others can copy your plan code.",
  "📷 Scan a friend's QR to connect instantly at the gym.",
  "🏆 Check the leaderboard to see where you rank this week.",
  "💬 Post a win in Community — PRs auto-share when you log!",
  "🌐 Join a community challenge from Social → Community.",
];

export function injectFeatureSpotlight(containerId, { title = "✨ Discover Gymify" } = {}) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const tip = DAILY_TIPS[new Date().getDay() % DAILY_TIPS.length];
  const chips = SPOTLIGHT_CHIPS.map((f) => `
    <a href="${f.href}" class="spotlight-chip">
      <span class="spotlight-chip-icon">${f.icon}</span>
      <span class="spotlight-chip-label">${f.label}</span>
      ${f.tag ? `<span class="spotlight-tag">${f.tag}</span>` : ""}
    </a>
  `).join("");

  el.innerHTML = `
    <div class="feature-spotlight">
      <div class="spotlight-header">${title}</div>
      <div class="spotlight-scroll">${chips}</div>
      <p class="spotlight-tip">${tip}</p>
    </div>`;
}
