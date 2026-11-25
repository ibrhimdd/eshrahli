const crypto = require("node:crypto");

const MAX_PAGES = Number(process.env.PDF_MAX_PAGES || 100);
const MIN_TEXT_CHARS = 100;
const CHUNK_TARGET = 4200;
const CHUNK_MAX = 6000;

function cleanText(value) {
  return String(value || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitPageText(text) {
  const paragraphs = cleanText(text).split(/\n{2,}/).filter(Boolean);
  const chunks = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (paragraph.length > CHUNK_MAX) {
      if (current) { chunks.push(current); current = ""; }
      for (let i = 0; i < paragraph.length; i += CHUNK_MAX) {
        chunks.push(paragraph.slice(i, i + CHUNK_MAX));
      }
      continue;
    }
    if (current && current.length + paragraph.length + 2 > CHUNK_TARGET) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = current ? current + "\n\n" + paragraph : paragraph;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function extractPdf(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 5 || buffer.subarray(0, 5).toString() !== "%PDF-") {
    const error = new Error("الملف المرفوع ليس PDF صالحًا.");
    error.status = 400;
    throw error;
  }

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false,
    stopAtErrors: true
  });
  const pdf = await loadingTask.promise;
  try {
    if (!pdf.numPages || pdf.numPages > MAX_PAGES) {
      const error = new Error("عدد صفحات الملف يتجاوز الحد المسموح (" + MAX_PAGES + " صفحة).");
      error.status = 413;
      throw error;
    }

    const pages = [];
    let totalChars = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = cleanText(content.items.map((item) => {
        const suffix = item.hasEOL ? "\n" : " ";
        return (item.str || "") + suffix;
      }).join(""));
      totalChars += text.length;
      pages.push({ pageNumber, text });
      page.cleanup();
    }

    if (totalChars < MIN_TEXT_CHARS) {
      const error = new Error("الملف يبدو PDF مصورًا أو لا يحتوي على نص قابل للاستخراج؛ حاليًا نقبل ملفات PDF النصية التي يمكن تحديد النص فيها ونسخه.");
      error.status = 422;
      throw error;
    }

    const chunks = [];
    for (const page of pages) {
      for (const text of splitPageText(page.text)) {
        chunks.push({ text, pageStart: page.pageNumber, pageEnd: page.pageNumber });
      }
    }

    return {
      pageCount: pdf.numPages,
      characterCount: totalChars,
      chunks,
      sha256: crypto.createHash("sha256").update(buffer).digest("hex")
    };
  } finally {
    await pdf.destroy();
  }
}

module.exports = { extractPdf };
