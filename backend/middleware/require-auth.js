const { getFirebaseAdmin } = require("../services/firebase-admin");

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ error: "سجّل الدخول أولًا لإكمال العملية." });

  try {
    const { auth } = getFirebaseAdmin();
    const decoded = await auth.verifyIdToken(match[1], true);
    req.user = { uid: decoded.uid, email: decoded.email || null };
    return next();
  } catch (error) {
    const status = error.status || 401;
    return res.status(status).json({
      error: status === 503 ? "خدمة الحسابات غير مهيأة على السيرفر." : "جلسة الدخول غير صالحة أو انتهت. سجّل الدخول مرة أخرى.",
      details: process.env.NODE_ENV === "production" ? undefined : error.message
    });
  }
}

module.exports = { requireAuth };
