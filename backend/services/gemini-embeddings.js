const MODEL = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-2";
const DIMENSIONS = 768;
const VERSION = MODEL + "@" + DIMENSIONS + ":v1";

async function embedText(text, purpose = "document", title = "none") {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const error = new Error("اضبط GEMINI_API_KEY على السيرفر لتفعيل البحث داخل الكتب.");
    error.status = 503;
    throw error;
  }

  const input = purpose === "query"
    ? "task: question answering | query: " + text
    : "title: " + title + " | text: " + text;

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":embedContent",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        model: "models/" + MODEL,
        content: { parts: [{ text: input }] },
        output_dimensionality: DIMENSIONS
      }),
      signal: AbortSignal.timeout(Number(process.env.EMBEDDING_TIMEOUT_MS || 30000))
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const error = new Error("Gemini Embeddings error (" + response.status + "): " + body.slice(0, 350));
    error.status = response.status === 429 ? 429 : 502;
    throw error;
  }

  const data = await response.json();
  const values = data.embedding?.values || data.embeddings?.[0]?.values;
  if (!Array.isArray(values) || values.length !== DIMENSIONS || values.some((v) => !Number.isFinite(v))) {
    throw new Error("Gemini returned an invalid embedding vector.");
  }
  return values;
}

module.exports = { embedText, EMBEDDING_MODEL: MODEL, EMBEDDING_DIMENSIONS: DIMENSIONS, EMBEDDING_VERSION: VERSION };
