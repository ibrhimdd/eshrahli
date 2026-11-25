const BASE = "https://openrouter.ai/api/v1";

function apiKey() {
  if (!process.env.OPENROUTER_API_KEY) {
    const error = new Error("مفتاح OpenRouter غير مضبوط على السيرفر.");
    error.status = 503;
    throw error;
  }
  return process.env.OPENROUTER_API_KEY;
}

async function request(path, options = {}) {
  const response = await fetch(BASE + path, {
    ...options,
    signal: AbortSignal.timeout(Number(process.env.AI_TIMEOUT_MS || 45000)),
    headers: {
      Authorization: "Bearer " + apiKey(),
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL || "https://eshrahli.vercel.app",
      "X-Title": "Eshrahli",
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const error = new Error("OpenRouter error " + response.status + ": " + body.slice(0, 400));
    error.status = response.status === 429 ? 429 : 502;
    throw error;
  }
  return response.json();
}

function free(model) {
  return Number(model?.pricing?.prompt) === 0 && Number(model?.pricing?.completion) === 0;
}

async function listModels() {
  const result = await request("/models");
  return (result.data || []).filter(free).map((m) => ({
    id: m.id,
    name: m.name || m.id,
    contextLength: m.context_length || null,
    supportsImages: (m.architecture?.input_modalities || []).includes("image"),
    free: true
  })).sort((a, b) => a.name.localeCompare(b.name));
}

async function resolveModel(value) {
  const id = String(value || "openrouter/free").trim();
  if (id === "openrouter/free") return id;
  const models = await listModels();
  if (!models.some((m) => m.id === id)) {
    const error = new Error("النموذج المختار غير متاح مجانًا حاليًا. حدّث القائمة واختر نموذجًا مجانيًا.");
    error.status = 400;
    throw error;
  }
  return id;
}

async function chatCompletion({ messages, model, temperature = 0.5, maxTokens = 1200 }) {
  const modelId = await resolveModel(model);
  const result = await request("/chat/completions", {
    method: "POST",
    body: JSON.stringify({ model: modelId, messages, temperature, max_tokens: maxTokens })
  });
  const content = result.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("النموذج لم يرجع إجابة نصية.");
  return { content: content.trim(), model: result.model || modelId, usage: result.usage || null };
}

module.exports = { listModels, chatCompletion };
