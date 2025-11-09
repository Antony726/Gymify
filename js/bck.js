const admin = require("firebase-admin");
const path = require("path");
const serviceAccount = require(path.join(__dirname, "gymify-26ebc-firebase-adminsdk-fbsvc-dbde41bbad.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function backfillProfilesBatch(pageSize = 100, startAfterDoc = null) {
  let query = db.collection("users").orderBy("__name__").limit(pageSize);
  if (startAfterDoc) {
    query = query.startAfter(startAfterDoc);
  }

  const snapshot = await query.get();
  if (snapshot.empty) return null;

  const batch = db.batch();

  for (const doc of snapshot.docs) {
    const uid = doc.id;

    const profileRef = db.doc(`users/${uid}/data/profile`);
    const profileSnap = await profileRef.get();

    // New username or fallback logic
    let username;
    if (profileSnap.exists && profileSnap.data().username) {
      username = profileSnap.data().username;
    } else {
      // Use email prefix fallback
      const email = doc.data().email || "unknown";
      username = email.split("@")[0];
      batch.set(profileRef, {
        username,
        email,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`Created profile for ${uid} with username: ${username}`);
    }
  }

  await batch.commit();
  return snapshot.docs[snapshot.docs.length - 1]; // last doc for next pagination
}

async function runBackfill() {
  let lastDoc = null;
  do {
    lastDoc = await backfillProfilesBatch(100, lastDoc);
  } while (lastDoc);
  console.log("Backfill complete.");
}

runBackfill();
