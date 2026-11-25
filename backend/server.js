require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mindmapRouter = require("./routes/mindmap");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "eshrahli-backend" });
});

app.use("/api/mindmap", mindmapRouter);

app.use((req, res) => {
  res.status(404).json({ error: "المسار ده مش موجود" });
});

app.listen(PORT, () => {
  console.log(`🖊️  سيرفر اشرحلي شغال على http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("ℹ️  مفيش ANTHROPIC_API_KEY متظبط — هيتم الرجوع لخريطة عامة بديلة لأي موضوع مش في المكتبة الجاهزة.");
  }
});
