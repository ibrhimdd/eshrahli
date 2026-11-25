const express = require("express");
const multer = require("multer");
const crypto = require("node:crypto");
const { requireAuth } = require("../middleware/require-auth");
const { getFirebaseAdmin } = require("../services/firebase-admin");
const { extractPdf } = require("../services/pdf-extractor");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.PDF_MAX_BYTES || 4 * 1024 * 1024), files: 1 },
  fileFilter(_req, file, callback) {
    const validName = /\.pdf$/i.test(file.originalname || "");
    if (file.mimetype !== "application/pdf" || !validName) {
      const error = new Error("ارفع ملف PDF فقط.");
      error.status = 400;
      return callback(error);
    }
    callback(null, true);
  }
});

function safeFileName(name) {
  return String(name || "document.pdf").replace(/[\\/\r\n\0]/g, "_").slice(0, 160);
}

function documentIdFor(uid, hash) {
  return crypto.createHash("sha256").update(uid + ":" + hash).digest("hex");
}

router.post("/", requireAuth, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "اختر ملف PDF أولًا." });
  try {
    const extracted = await extractPdf(req.file.buffer);
    const { db, FieldValue } = getFirebaseAdmin();
    const documentId = documentIdFor(req.user.uid, extracted.sha256);
    const documentRef = db.collection("documents").doc(documentId);
    const existing = await documentRef.get();

    if (existing.exists && existing.data().status === "ready") {
      return res.status(200).json({
        document: { id: documentId, ...existing.data() },
        duplicate: true,
        message: "الملف موجود بالفعل؛ استخدمنا النسخة المعالجة السابقة."
      });
    }

    const now = FieldValue.serverTimestamp();
    await documentRef.set({
      ownerUid: req.user.uid,
      name: safeFileName(req.file.originalname),
      mimeType: "application/pdf",
      sha256: extracted.sha256,
      pageCount: extracted.pageCount,
      characterCount: extracted.characterCount,
      chunkCount: extracted.chunks.length,
      status: "processing",
      createdAt: now,
      updatedAt: now
    }, { merge: true });

    const chunksRef = documentRef.collection("chunks");
    const oldChunks = await chunksRef.get();
    for (let i = 0; i < oldChunks.docs.length; i += 400) {
      const batch = db.batch();
      oldChunks.docs.slice(i, i + 400).forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }

    for (let i = 0; i < extracted.chunks.length; i += 400) {
      const batch = db.batch();
      extracted.chunks.slice(i, i + 400).forEach((chunk, offset) => {
        const chunkRef = chunksRef.doc(String(i + offset).padStart(5, "0"));
        batch.set(chunkRef, {
          ownerUid: req.user.uid,
          documentId,
          chunkIndex: i + offset,
          pageStart: chunk.pageStart,
          pageEnd: chunk.pageEnd,
          text: chunk.text,
          createdAt: now
        });
      });
      await batch.commit();
    }

    await documentRef.update({ status: "ready", updatedAt: FieldValue.serverTimestamp() });
    const saved = await documentRef.get();
    return res.status(201).json({
      document: { id: documentId, ...saved.data() },
      duplicate: false,
      message: "تم استخراج نص الملف وحفظه وتقسيمه بنجاح."
    });
  } catch (error) {
    console.error("PDF processing failed:", error.message);
    return res.status(error.status || 500).json({
      error: error.message || "تعذرت معالجة ملف PDF.",
      details: process.env.NODE_ENV === "production" ? undefined : error.stack
    });
  }
});

router.get("/", requireAuth, async (req, res) => {
  try {
    const { db } = getFirebaseAdmin();
    const snapshot = await db.collection("documents")
      .where("ownerUid", "==", req.user.uid)
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();
    res.json({ documents: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) });
  } catch (error) {
    res.status(error.status || 500).json({ error: "تعذر تحميل ملفاتك." });
  }
});

router.get("/:id/chunks", requireAuth, async (req, res) => {
  try {
    const { db } = getFirebaseAdmin();
    const ref = db.collection("documents").doc(req.params.id);
    const document = await ref.get();
    if (!document.exists || document.data().ownerUid !== req.user.uid) {
      return res.status(404).json({ error: "الملف غير موجود." });
    }
    const snapshot = await ref.collection("chunks").orderBy("chunkIndex").limit(100).get();
    res.json({
      document: { id: document.id, name: document.data().name, pageCount: document.data().pageCount },
      chunks: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: "تعذر قراءة محتوى الملف." });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const { db } = getFirebaseAdmin();
    const ref = db.collection("documents").doc(req.params.id);
    const document = await ref.get();
    if (!document.exists || document.data().ownerUid !== req.user.uid) {
      return res.status(404).json({ error: "الملف غير موجود." });
    }
    const chunks = await ref.collection("chunks").get();
    for (let i = 0; i < chunks.docs.length; i += 400) {
      const batch = db.batch();
      chunks.docs.slice(i, i + 400).forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
    await ref.delete();
    res.json({ deleted: true });
  } catch (error) {
    res.status(error.status || 500).json({ error: "تعذر حذف الملف." });
  }
});

module.exports = router;
