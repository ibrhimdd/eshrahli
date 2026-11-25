require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mindmapRouter = require("./routes/mindmap");
const modelsRouter = require("./routes/models");
const chatRouter = require("./routes/chat");
const documentsRouter = require("./routes/documents");

const app = express();
const PORT = process.env.PORT || 4000;
const allowedOrigins = (process.env.CORS_ORIGINS || "").split(",").map((v) => v.trim()).filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed by CORS"));
  }
}));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "eshrahli-backend", aiProvider: "openrouter" });
});

app.use("/api/models", modelsRouter);
app.use("/api/chat", chatRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/mindmap", mindmapRouter);

app.use((req, res) => res.status(404).json({ error: "المسار ده مش موجود" }));
app.use((error, _req, res, _next) => {
  const status = error.status || (error.code === "LIMIT_FILE_SIZE" ? 413 : 400);
  const message = error.code === "LIMIT_FILE_SIZE"
    ? "حجم ملف PDF أكبر من الحد المسموح (4 ميجابايت افتراضيًا)."
    : (error.status && error.message ? error.message : "تعذر معالجة الطلب.");
  res.status(status).json({
    error: message,
    details: process.env.NODE_ENV === "production" ? undefined : error.message
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log("Eshrahli API listening on port " + PORT);
    if (!process.env.OPENROUTER_API_KEY) console.warn("OPENROUTER_API_KEY is not configured.");
  });
}

module.exports = app;
