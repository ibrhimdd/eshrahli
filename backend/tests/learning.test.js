const test = require("node:test");
const assert = require("node:assert/strict");
const { testHelpers } = require("../routes/learning");

test("parseJson accepts fenced JSON responses", () => {
  assert.deepEqual(testHelpers.parseJson('```json\n{"title":"درس"}\n```'), { title: "درس" });
});

test("mind map validator accepts the board schema", () => {
  assert.equal(testHelpers.validMap({
    title: "الطاقة",
    branches: [
      { label: "أنواعها", highlight: true, children: ["حركية", "وضع"] },
      { label: "مصادرها", children: ["الشمس", "الرياح"] }
    ]
  }), true);
  assert.equal(testHelpers.validMap({ title: "فارغة", branches: [] }), false);
});

test("quiz validator requires four options and a valid answer index", () => {
  assert.equal(testHelpers.validQuiz({
    title: "اختبار",
    questions: [{
      question: "ما مصدر الطاقة؟",
      options: ["الشمس", "القمر", "الصخور", "الهواء"],
      correctIndex: 0,
      explanation: "الشمس مصدر رئيسي للطاقة."
    }]
  }), false);
  assert.equal(testHelpers.validQuiz({
    title: "اختبار",
    questions: [
      { question: "س1", options: ["أ", "ب", "ج", "د"], correctIndex: 0, explanation: "لأنها صحيحة" },
      { question: "س2", options: ["أ", "ب", "ج", "د"], correctIndex: 1, explanation: "لأنها صحيحة" },
      { question: "س3", options: ["أ", "ب", "ج", "د"], correctIndex: 2, explanation: "لأنها صحيحة" }
    ]
  }), true);
});
