import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
  collection, doc, getDoc, getDocs, query, where, setDoc
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { parseQRData } from "./qr-utils.js";

let currentUser = null;
let scannedUid = null;
let scanner = null;

const resultCard = document.getElementById("resultCard");
const resultText = document.getElementById("resultText");
const viewProfileBtn = document.getElementById("viewProfileBtn");

function showResult(message, uid = null) {
  resultCard.style.display = "block";
  resultText.textContent = message;
  scannedUid = uid;
  viewProfileBtn.style.display = uid ? "block" : "none";
}

async function getUsername(userId) {
  const profileRef = doc(db, "users", userId, "data", "profile");
  const snap = await getDoc(profileRef);
  return snap.exists() ? snap.data().username : "User";
}

async function sendFriendRequest(toId) {
  if (!currentUser || toId === currentUser.uid) {
    showResult("You can't add yourself!");
    return;
  }

  const friendsRef = doc(db, "users", currentUser.uid, "friends", toId);
  const friendSnap = await getDoc(friendsRef);
  if (friendSnap.exists()) {
    showResult("You're already friends!", toId);
    return;
  }

  const reqRef = collection(db, "friendRequests");
  const existQ = query(reqRef, where("from", "==", currentUser.uid), where("to", "==", toId), where("status", "==", "pending"));
  const existSnap = await getDocs(existQ);
  if (!existSnap.empty) {
    showResult("Friend request already sent!", toId);
    return;
  }

  const myName = await getUsername(currentUser.uid);
  const toName = await getUsername(toId);
  const requestRef = doc(collection(db, "friendRequests"));
  await setDoc(requestRef, {
    from: currentUser.uid,
    to: toId,
    fromName: myName,
    toName,
    status: "pending",
    timestamp: new Date().toISOString(),
    via: "qr_scan",
  });

  showResult(`Friend request sent to ${toName}! 🎉`, toId);
  window.showToast?.(`Request sent to ${toName}!`, "success");
}

async function handleQRContent(raw) {
  const parsed = parseQRData(raw);
  if (!parsed?.uid) {
    showResult("Invalid Gymify QR code. Try scanning from their profile page.");
    return;
  }
  await sendFriendRequest(parsed.uid);
}

document.getElementById("manualScanBtn").addEventListener("click", async () => {
  const code = document.getElementById("manualCode").value.trim();
  if (!code) return window.showToast?.("Paste a code first", "warning");
  await handleQRContent(code);
});

viewProfileBtn.addEventListener("click", () => {
  if (scannedUid) window.location.href = `friend-profile.html?id=${scannedUid}`;
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  currentUser = user;

  const urlParams = new URLSearchParams(window.location.search);
  const uidParam = urlParams.get("uid");
  if (uidParam) {
    await sendFriendRequest(uidParam);
    return;
  }

  if (typeof Html5Qrcode === "undefined") return;

  scanner = new Html5Qrcode("qr-reader");
  try {
    await scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      async (decoded) => {
        await scanner.stop();
        await handleQRContent(decoded);
      },
      () => {}
    );
  } catch (err) {
    console.warn("Camera not available:", err);
  }
});

window.addEventListener("beforeunload", () => {
  scanner?.stop().catch(() => {});
});
