const express = require("express");
const { requireAuth } = require("../middleware/require-auth");
const { getFirebaseAdmin } = require("../services/firebase-admin");
const { chatCompletion } = require("../services/ai-provider");

const router = express.Router();
const SYSTEM_PROMPT = "أنت اشرحلي، مدرس ذكي عربي صبور. اشرح بتدرج ووضوح، واستخدم أمثلة عند الحاجة. لا تختلق مصادر أو أرقام صفحات، وصرّح إذا لم تكن متأكدًا.";

function cleanTitle(value) {
  return String(value || "محادثة جديدة").replace(/\s+/g, " ").trim().slice(0, 72) || "محادثة جديدة";
}

async function ownedSession(db, id, uid) {
  const ref = db.collection("chat_sessions").doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data().ownerUid !== uid) return null;
  return { ref, data: snapshot.data() };
}

router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const { db } = getFirebaseAdmin();
    const snapshot = await db.collection("chat_sessions")
      .where("ownerUid", "==", req.user.uid)
      .orderBy("updatedAt", "desc")
      .limit(30)
      .get();
    res.json({ sessions: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) });
  } catch (error) {
    res.status(500).json({ error: "تعذر تحميل محادثاتك." });
  }
});

router.post("/", async (req, res) => {
  try {
    const { db, FieldValue } = getFirebaseAdmin();
    const ref = db.collection("chat_sessions").doc();
    const title = cleanTitle(req.body?.title);
    await ref.set({
      ownerUid: req.user.uid,
      title,
      messageCount: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    res.status(201).json({ session: { id: ref.id, title } });
  } catch (_error) {
    res.status(500).json({ error: "تعذر إنشاء محادثة جديدة." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { db } = getFirebaseAdmin();
    const session = await ownedSession(db, req.params.id, req.user.uid);
    if (!session) return res.status(404).json({ error: "المحادثة غير موجودة." });
    const snapshot = await session.ref.collection("messages")
      .orderBy("createdAt", "asc")
      .limit(100)
      .get();
    res.json({
      session: { id: session.ref.id, title: session.data.title },
      messages: snapshot.docs.map((doc) => {
        const data = doc.data();
        return { role: data.role, content: data.content, model: data.model || null };
      })
    });
  } catch (_error) {
    res.status(500).json({ error: "تعذر تحميل المحادثة." });
  }
});

router.post("/:id/messages", async (req, res) => {
  const message = String(req.body?.message || "").trim();
  if (!message) return res.status(400).json({ error: "اكتب رسالتك أولًا." });
  if (message.length > 8000) return res.status(413).json({ error: "الرسالة طويلة جدًا؛ الحد الأقصى 8000 حرف." });

  try {
    const { db, FieldValue } = getFirebaseAdmin();
    const session = await ownedSession(db, req.params.id, req.user.uid);
    if (!session) return res.status(404).json({ error: "المحادثة غير موجودة." });

    const messagesRef = session.ref.collection("messages");
    const historySnapshot = await messagesRef.orderBy("createdAt", "desc").limit(12).get();
    const history = historySnapshot.docs.reverse().map((doc) => {
      const data = doc.data();
      return { role: data.role, content: data.content };
    });

    const result = await chatCompletion({
      model: req.body?.model,
      maxTokens: 1400,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...history, { role: "user", content: message }]
    });

    const batch = db.batch();
    batch.set(messagesRef.doc(), {
      role: "user", content: message,
      createdAt: FieldValue.serverTimestamp()
    });
    batch.set(messagesRef.doc(), {
      role: "assistant", content: result.content, model: result.model,
      createdAt: FieldValue.serverTimestamp()
    });
    batch.update(session.ref, {
      messageCount: FieldValue.increment(2),
      updatedAt: FieldValue.serverTimestamp(),
      ...(session.data.messageCount === 0 ? { title: cleanTitle(message) } : {})
    });
    await batch.commit();

    res.json({ reply: result.content, model: result.model, usage: result.usage });
  } catch (error) {
    res.status(error.status || 502).json({
      error: error.status === 400 ? error.message : "تعذر الحصول على إجابة من المدرس الذكي.",
      details: process.env.NODE_ENV === "production" ? undefined : error.message
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { db } = getFirebaseAdmin();
    const session = await ownedSession(db, req.params.id, req.user.uid);
    if (!session) return res.status(404).json({ error: "المحادثة غير موجودة." });
    const messages = await session.ref.collection("messages").get();
    for (let i = 0; i < messages.docs.length; i += 400) {
      const batch = db.batch();
      messages.docs.slice(i, i + 400).forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
    await session.ref.delete();
    res.json({ deleted: true });
  } catch (_error) {
    res.status(500).json({ error: "تعذر حذف المحادثة." });
  }
});

module.exports = router;
