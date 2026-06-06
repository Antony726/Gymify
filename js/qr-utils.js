export function buildProfileQRData(uid, username) {
  return JSON.stringify({
    app: "gymify",
    v: 1,
    uid,
    username: username || "GymBro",
    action: "add_friend",
  });
}

export function parseQRData(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed.app === "gymify" && parsed.uid) return parsed;
  } catch (e) {}

  const urlMatch = trimmed.match(/[?&]uid=([^&]+)/i);
  if (urlMatch) {
    return { app: "gymify", uid: decodeURIComponent(urlMatch[1]), action: "add_friend" };
  }

  if (/^[a-zA-Z0-9]{20,}$/.test(trimmed)) {
    return { app: "gymify", uid: trimmed, action: "add_friend" };
  }

  return null;
}

export function renderQRCode(container, text) {
  if (!container || typeof QRCode === "undefined") return false;
  container.innerHTML = "";
  try {
    new QRCode(container, {
      text,
      width: 180,
      height: 180,
      colorDark: "#06b6d4",
      colorLight: "#0d1525",
      correctLevel: QRCode.CorrectLevel.M,
    });
    return true;
  } catch (err) {
    container.innerHTML = `<p style="color:var(--color-danger);font-size:12px;">Could not generate QR</p>`;
    return false;
  }
}
