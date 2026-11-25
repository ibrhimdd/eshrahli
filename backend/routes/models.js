const express = require("express");
const { listModels } = require("../services/ai-provider");
const router = express.Router();

router.get("/", async (_req, res) => {
  try {
    const models = await listModels();
    res.set("Cache-Control", "no-store");
    res.json({ provider: "openrouter", defaultModel: "openrouter/free", freeOnly: true, models });
  } catch (error) {
    res.status(error.status || 503).json({
      error: "تعذر تحميل قائمة النماذج المجانية.",
      details: process.env.NODE_ENV === "production" ? undefined : error.message
    });
  }
});

module.exports = router;
