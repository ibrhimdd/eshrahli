const express = require("express");
const { chatCompletion } = require("../services/ai-provider");
const router = express.Router();

function isValidMindMap(data) {
  return !!data && typeof data.title === "string" &&
    Array.isArray(data.branches) && data.branches.length > 0 &&
    data.branches.length <= 8 && data.branches.every((branch) =>
      typeof branch.label === "string" && Array.isArray(branch.children) &&
      branch.children.length <= 8 && branch.children.every((child) => typeof child === "string")
    );
}

function extractJson(text) {
  const cleaned = text.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("لم يرجع النموذج JSON صالحًا.");
  return JSON.parse(cleaned.slice(start, end + 1));
}

router.post("/", async (req, res) => {
  const topic = String(req.body?.topic || "").trim();
  if (!topic) return res.status(400).json({ error: "اكتب الموضوع المطلوب." });
  if (topic.length > 3000) return res.status(413).json({ error: "الموضوع طويل جدًا؛ اختصره إلى 3000 حرف." });

  const prompt = `حوّل الموضوع التالي إلى خريطة ذهنية تعليمية عربية واضحة.
أعد JSON فقط بالشكل:
{"title":"عنوان","branches":[{"label":"فرع","highlight":false,"children":["نقطة","نقطة"]}]}
أنشئ 3 إلى 6 فروع، ولكل فرع 2 إلى 4 نقاط قصيرة. اجعل فرعًا واحدًا فقط highlight=true.
لا تضف Markdown أو نصًا خارج JSON. لا تخترع تفاصيل غير مؤكدة.
الموضوع:
${topic}`;

  try {
    const result = await chatCompletion({
      model: req.body?.model, temperature: 0.3, maxTokens: 1600,
      messages: [{ role: "user", content: prompt }]
    });
    const map = extractJson(result.content);
    if (!isValidMindMap(map)) throw new Error("بنية الخريطة التي أنشأها النموذج غير مطابقة.");
    res.json({ ...map, model: result.model, generic: false });
  } catch (error) {
    res.status(error.status || 502).json({
      error: "تعذر إنشاء خريطة ذهنية حقيقية الآن. لم نعرض خريطة تجريبية بدلًا منها.",
      details: process.env.NODE_ENV === "production" ? undefined : error.message
    });
  }
});

module.exports = router;
