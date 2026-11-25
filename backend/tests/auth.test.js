const test = require("node:test");
const assert = require("node:assert/strict");
const app = require("../server");

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = "http://127.0.0.1:" + server.address().port;
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("document listing requires a Firebase ID token", async () => {
  const response = await fetch(baseUrl + "/api/documents");
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.match(body.error, /سجّل الدخول/);
});

test("document upload requires authentication before parsing the file", async () => {
  const form = new FormData();
  form.append("file", new Blob(["not a pdf"], { type: "application/pdf" }), "sample.pdf");
  const response = await fetch(baseUrl + "/api/documents", { method: "POST", body: form });
  assert.equal(response.status, 401);
});
