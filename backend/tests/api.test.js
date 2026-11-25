const test = require("node:test");
const assert = require("node:assert/strict");
const app = require("../server");

let server;
let baseUrl;

test.before(async () => {
  process.env.OPENROUTER_API_KEY = "";
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = "http://127.0.0.1:" + server.address().port;
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("health endpoint responds", async () => {
  const response = await fetch(baseUrl + "/api/health");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "ok");
});

test("mindmap rejects an empty topic", async () => {
  const response = await fetch(baseUrl + "/api/mindmap", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({})
  });
  assert.equal(response.status, 400);
});

test("chat rejects an empty message", async () => {
  const response = await fetch(baseUrl + "/api/chat", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({})
  });
  assert.equal(response.status, 400);
});

test("model catalog reports missing server key without exposing secrets", async () => {
  const response = await fetch(baseUrl + "/api/models");
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.match(body.error, /النماذج المجانية/);
});
