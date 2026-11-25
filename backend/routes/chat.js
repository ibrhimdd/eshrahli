const express = require("express");
const { chatCompletion } = require("../services/ai-provider");
const router = express.Router();

const SYSTEM_PROMPT = `أنت «اشرحلي»، مدرس ذكي عربي صبور. اشرح باللغة التي يستخدمها الطالب وبأسلوب واضح ومتدرج. ابدأ بالفكرة الأساسية ثم مثال عند الحاجة. لا تدّعِ أنك قرأت كتابًا أو ملفًا لم يُرسل إليك. إذا لم تكن متأكدًا فقل ذلك بوضوح، ولا تخترع مصادر أو أرقام صفحات.`;

router.post("/", async (req, res) => {
  const message = String(req.body?.message || "").trim();
  const history = Array.isArray(req.body?.history) ? req.body.history : [];
  if (!message) return res.status(400).json({ error: "اكتب سؤالك أولًا." });
  if (message.length > 8000) return res.status(413).json({ error: "السؤال طويل جدًا؛ الحد الأقصى 8000 حرف." });

  const safeHistory = history.slice(-12).filter((item) =>
    item && ["user", "assistant"].includes(item.role) &&
    typeof item.content === "string" && item.content.length <= 8000
  );

  try {
    const result = await chatCompletion({
      model: req.body?.model,
      maxTokens: 1400,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...safeHistory, { role: "user", content: message }]
    });
    res.json({ reply: result.content, model: result.model, usage: result.usage });
  } catch (error) {
    res.status(error.status || 502).json({
      error: "لم أتمكن من الحصول على إجابة من نموذج الذكاء الاصطناعي.",
      details: process.env.NODE_ENV === "production" ? undefined : error.message
    });
  }
});

module.exports = router;
