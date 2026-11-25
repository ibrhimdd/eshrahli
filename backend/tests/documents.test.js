const test = require("node:test");
const assert = require("node:assert/strict");
const { extractPdf } = require("../services/pdf-extractor");

test("PDF extractor rejects non-PDF bytes", async () => {
  await assert.rejects(
    extractPdf(Buffer.from("not a pdf")),
    (error) => error.status === 400 && /PDF/.test(error.message)
  );
});

test("PDF extractor rejects empty buffers", async () => {
  await assert.rejects(
    extractPdf(Buffer.alloc(0)),
    (error) => error.status === 400
  );
});
