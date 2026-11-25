const test = require("node:test");
const assert = require("node:assert/strict");
const { freeTextModel } = require("../services/ai-provider");

test("only explicit free variants with zero text pricing are selectable", () => {
  assert.equal(freeTextModel({
    id: "provider/model:free",
    pricing: { prompt: "0", completion: "0" },
    architecture: { input_modalities: ["text"], output_modalities: ["text"] }
  }), true);
  assert.equal(freeTextModel({
    id: "provider/model",
    pricing: { prompt: "0", completion: "0" },
    architecture: { input_modalities: ["text"], output_modalities: ["text"] }
  }), false);
  assert.equal(freeTextModel({
    id: "provider/model:free",
    pricing: { prompt: "0", completion: "0.000001" },
    architecture: { input_modalities: ["text"], output_modalities: ["text"] }
  }), false);
  assert.equal(freeTextModel({
    id: "provider/model:free",
    pricing: { prompt: "0", completion: "0" },
    architecture: { input_modalities: ["image"], output_modalities: ["text"] }
  }), false);
});
