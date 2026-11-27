const express = require("express");
const multer = require("multer");
const crypto = require("node:crypto");
const { requireAuth } = require("../middleware/require-auth");
const { getFirebaseAdmin } = require("../services/firebase-admin");
const { extractPdf } = require("../services/pdf-extractor");
const { embedText, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, EMBEDDING_VERSION } = require("../services/gemini-embeddings");
const { chatCompletion } = require("../services/ai-provider");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.PDF_MAX_BYTES || 4 * 1024 * 1024), files: 1 },
  fileFilter(_req, file, callback) {
    const validName = /\.pdf$/i.test(file.originalname || "");
    const mime = String(file.mimetype || "").toLowerCase();
    // Android/iOS document pickers sometimes report an empty or generic MIME type.
    // The PDF signature is validated after upload by extractPdf, so don't reject those clients here.
    const acceptedMime = !mime || [
      "application/pdf",
      "application/x-pdf",
      "application/octet-stream"
    ].includes(mime);
    if (!validName || !acceptedMime) {
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
    // Filter by owner in Firestore, then sort locally to avoid requiring a
    // composite index on ownerUid + createdAt in newly configured projects.
    const snapshot = await db.collection("documents")
      .where("ownerUid", "==", req.user.uid)
      .get();
    const documents = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
        const time = (value) => value && typeof value.toMillis === "function"
          ? value.toMillis()
          : value && typeof value.seconds === "number" ? value.seconds * 1000 : 0;
        return time(b.createdAt) - time(a.createdAt);
      })
      .slice(0, 50);
    res.json({ documents });
  } catch (error) {
    console.error("Document list failed:", {
      code: error.code || "unknown",
      message: error.message || "Unknown Firestore error"
    });
    res.status(error.status || 500).json({ error: "تعذر تحميل ملفاتك." });
  }
});

router.post("/:id/index", requireAuth, async (req, res) => {
  const { db, FieldValue } = getFirebaseAdmin();
  const documentRef = db.collection("documents").doc(req.params.id);
  try {
    const document = await documentRef.get();
    if (!document.exists || document.data().ownerUid !== req.user.uid) {
      return res.status(404).json({ error: "الملف غير موجود." });
    }
    if (document.data().status !== "ready") {
      return res.status(409).json({ error: "الملف لم ينتهِ من استخراج النص بعد." });
    }

    const chunksRef = documentRef.collection("chunks");
    const snapshot = await chunksRef.orderBy("chunkIndex").get();
    const pending = snapshot.docs.filter((doc) => doc.get("embeddingVersion") !== EMBEDDING_VERSION);
    const limit = Math.min(8, Math.max(1, Number(req.body?.limit) || 5));
    const currentBatch = pending.slice(0, limit);

    const vectors = await Promise.all(currentBatch.map((doc) =>
      embedText(doc.get("text"), "document", document.data().name)
    ));

    const batch = db.batch();
    currentBatch.forEach((doc, index) => {
      batch.update(doc.ref, {
        embedding: FieldValue.vector(vectors[index]),
        embeddingModel: EMBEDDING_MODEL,
        embeddingDimensions: EMBEDDING_DIMENSIONS,
        embeddingVersion: EMBEDDING_VERSION,
        embeddedAt: FieldValue.serverTimestamp()
      });
    });
    if (currentBatch.length) await batch.commit();

    const remaining = Math.max(0, pending.length - currentBatch.length);
    await documentRef.update({
      embeddingStatus: remaining === 0 ? "ready" : "processing",
      embeddingModel: EMBEDDING_MODEL,
      embeddingDimensions: EMBEDDING_DIMENSIONS,
      embeddedChunks: snapshot.size - remaining,
      remainingChunks: remaining,
      updatedAt: FieldValue.serverTimestamp()
    });

    return res.json({
      indexed: currentBatch.length,
      remaining,
      totalChunks: snapshot.size,
      embeddingModel: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
      complete: remaining === 0
    });
  } catch (error) {
    console.error("Embedding indexing failed:", error.message);
    try {
      await documentRef.update({
        embeddingStatus: "failed",
        embeddingError: "تعذر إنشاء التضمينات. يمكنك إعادة المحاولة.",
        updatedAt: FieldValue.serverTimestamp()
      });
    } catch (_ignored) {}
    return res.status(error.status || 502).json({
      error: error.status === 503 ? error.message : "تعذر تجهيز البحث الدلالي لهذا الملف.",
      details: process.env.NODE_ENV === "production" ? undefined : error.message
    });
  }
});

router.post("/:id/ask", requireAuth, async (req, res) => {
  const question = String(req.body?.question || "").trim();
  if (!question) return res.status(400).json({ error: "اكتب سؤالك عن الملف." });
  if (question.length > 2500) return res.status(413).json({ error: "السؤال طويل جدًا؛ الحد الأقصى 2500 حرف." });

  try {
    const { db } = getFirebaseAdmin();
    const documentRef = db.collection("documents").doc(req.params.id);
    const document = await documentRef.get();
    if (!document.exists || document.data().ownerUid !== req.user.uid) {
      return res.status(404).json({ error: "الملف غير موجود." });
    }
    if (document.data().embeddingStatus !== "ready" ||
        document.data().embeddingModel !== EMBEDDING_MODEL ||
        document.data().embeddingDimensions !== EMBEDDING_DIMENSIONS) {
      return res.status(409).json({ error: "جهّز البحث الدلالي للملف أولًا من زر فهرسة الملف." });
    }

    const queryVector = await embedText(question, "query");
    const nearest = await documentRef.collection("chunks").findNearest({
      vectorField: "embedding",
      queryVector,
      limit: 6,
      distanceMeasure: "COSINE",
      distanceResultField: "vector_distance"
    }).get();

    const sources = nearest.docs.map((doc) => {
      const data = doc.data();
      return {
        chunkId: doc.id,
        pageStart: data.pageStart,
        pageEnd: data.pageEnd,
        distance: data.vector_distance ?? null,
        text: String(data.text || "").slice(0, 2600)
      };
    }).filter((source) => source.text);

    if (!sources.length) {
      return res.status(404).json({ error: "لم أجد مقاطع مفهرسة مناسبة في هذا الملف." });
    }

    const context = sources.map((source, index) =>
      "[المصدر " + (index + 1) + " | صفحة " + source.pageStart + "]\n" + source.text
    ).join("\n\n---\n\n");

    const result = await chatCompletion({
      model: req.body?.model,
      temperature: 0.2,
      maxTokens: 1300,
      messages: [
        {
          role: "system",
          content: "أنت مدرس يجيب اعتمادًا على نص الكتاب المرفق فقط. لا تضف حقائق من خارج المصادر. إذا لم تكفِ المصادر فقل إن الإجابة غير موجودة بوضوح في الجزء المتاح. اذكر أرقام الصفحات داخل الإجابة بصيغة [صفحة رقم]. أجب بالعربية الواضحة."
        },
        {
          role: "user",
          content: "اسم الملف: " + document.data().name + "\nسؤال الطالب: " + question + "\n\nمقاطع الكتاب المسترجعة:\n" + context
        }
      ]
    });

    return res.json({
      answer: result.content,
      model: result.model,
      documentId: document.id,
      sources: sources.map(({ chunkId, pageStart, pageEnd, distance }) => ({
        chunkId, pageStart, pageEnd, distance
      }))
    });
  } catch (error) {
    console.error("Document question failed:", error.message);
    const missingIndex = /index.*(needed|required|not exist)|requires an index/i.test(error.message || "");
    return res.status(error.status || (missingIndex ? 503 : 502)).json({
      error: missingIndex
        ? "فهرس Firestore للمتجهات غير جاهز بعد. أنشئ فهرس chunks لحقل embedding بأبعاد 768."
        : "تعذر البحث أو الإجابة عن السؤال حاليًا.",
      details: process.env.NODE_ENV === "production" ? undefined : error.message
    });
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
