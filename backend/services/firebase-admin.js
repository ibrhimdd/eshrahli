const { getApps, initializeApp, cert, applicationDefault } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

let cached = null;

function getFirebaseAdmin() {
  if (cached) return cached;
  if (getApps().length) {
    cached = { auth: getAuth(), db: getFirestore(), FieldValue };
    return cached;
  }

  let credential;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(raw);
      if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
      }
    } catch (_error) {
      const error = new Error("FIREBASE_SERVICE_ACCOUNT_JSON must contain valid service-account JSON.");
      error.status = 503;
      throw error;
    }
    credential = cert(serviceAccount);
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    credential = applicationDefault();
  } else {
    const error = new Error("Firebase Admin is not configured. Add FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS.");
    error.status = 503;
    throw error;
  }

  const app = initializeApp({
    credential,
    projectId: process.env.FIREBASE_PROJECT_ID || undefined
  });
  cached = { auth: getAuth(app), db: getFirestore(app), FieldValue };
  return cached;
}

module.exports = { getFirebaseAdmin };
