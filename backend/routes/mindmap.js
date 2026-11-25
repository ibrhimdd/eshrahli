const express = require("express");
const router = express.Router();

const MODEL = process.env.ANTHROPIC_MODEL || "claude-3-haiku-20240307";

// خريطة عامة بديلة بتتستخدم لو مفيش مفتاح ذكاء اصطناعي، أو لو الطلب لنموذج الذكاء الاصطناعي فشل.
function buildGeneric(topic) {
  return {
    title: topic,
    generic: true,
    branches: [
      { label: "التعريف", children: ["المفهوم الأساسي"] },
      { label: "الأنواع", highlight: true, children: ["النوع الأول", "النوع الثاني"] },
      { label: "أمثلة", children: ["مثال تطبيقي"] },
      { label: "الأهمية", children: ["ليه بندرسه"] },
    ],
  };
}

function isValidMindMap(data) {
  return (
    !!data &&
    typeof data.title === "string" &&
    Array.isArray(data.branches) &&
    data.branches.length > 0 &&
    data.branches.every(
      (b) => typeof b.label === "string" && Array.isArray(b.children)
    )
  );
}

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("مفيش JSON في رد النموذج");
  return JSON.parse(match[0]);
}

async function callAnthropic(topic) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const prompt = [
    "انت مساعد بيحول أي موضوع دراسي لخريطة ذهنية (mind map) باللغة العربية.",
    `الموضوع: "${topic}"`,
    "رجّعلي JSON فقط، من غير أي شرح أو تنسيق Markdown، بالشكل ده بالظبط:",
    '{"title":"اسم الموضوع","branches":[{"label":"اسم الفرع","highlight":false,"children":["نقطة فرعية 1","نقطة فرعية 2"]}]}',
    "اعمل من 3 إلى 4 فروع، وكل فرع من نقطتين لـ 3 نقاط فرعية قصيرة.",
    "خلي فرع واحد بس highlight:true (الأهم في الموضوع).",
    "كل النصوص لازم تكون عربية فصحى بسيطة ومختصرة (كلمة لـ 4 كلمات لكل عنصر).",
  ].join("\n");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`فشل طلب Anthropic: ${response.status} ${body}`);
  }

  const json = await response.json();
  const textBlock = (json.content || []).find((c) => c.type === "text");
  if (!textBlock) throw new Error("مفيش نص في رد Anthropic");

  const data = extractJson(textBlock.text);
  if (!isValidMindMap(data)) throw new Error("شكل JSON اللي رجع مش مطابق للمتوقع");
  return data;
}

router.post("/", async (req, res) => {
  const topic = (req.body && req.body.topic ? String(req.body.topic) : "").trim();
  if (!topic) {
    return res.status(400).json({ error: "محتاج تبعت topic في جسم الطلب" });
  }

  try {
    const aiResult = await callAnthropic(topic);
    if (aiResult) return res.json(aiResult);
  } catch (err) {
    console.warn("[mindmap] فشل توليد الخريطة بالذكاء الاصطناعي، هنرجع خريطة عامة:", err.message);
  }

  return res.json(buildGeneric(topic));
});

module.exports = router;
