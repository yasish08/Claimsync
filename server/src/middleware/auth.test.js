import test from "node:test";
import assert from "node:assert/strict";
import { requireRole } from "./auth.js";

function responseRecorder() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test("requireRole rejects missing users", () => {
  const res = responseRecorder();
  let called = false;
  requireRole("ADMIN")({}, res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error.code, "FORBIDDEN");
});

test("requireRole rejects roles not in allowlist", () => {
  const res = responseRecorder();
  let called = false;
  requireRole("ADMIN")({ user: { role: "AGENT" } }, res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
});

test("requireRole allows an explicitly permitted role", () => {
  const res = responseRecorder();
  let called = false;
  requireRole("ADMIN", "MANAGER")({ user: { role: "MANAGER" } }, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(res.statusCode, 200);
});
