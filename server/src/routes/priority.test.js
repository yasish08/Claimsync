import test from "node:test";
import assert from "node:assert/strict";
import { calculatePriority } from "./claims.js";

const now = Date.parse("2026-10-20T12:00:00.000Z");
const safeDeadline = "2026-12-01T12:00:00.000Z";

test("priority scorer maps low, medium and high score bands", () => {
  assert.equal(calculatePriority({ urgency: 1, businessImpact: 1, slaDeadline: safeDeadline, now }).priority, "LOW");
  assert.equal(calculatePriority({ urgency: 3, businessImpact: 3, slaDeadline: safeDeadline, now }).priority, "MEDIUM");
  assert.equal(calculatePriority({ urgency: 5, businessImpact: 3, slaDeadline: safeDeadline, now }).priority, "HIGH");
});

test("priority scorer marks urgent high-impact claims near SLA as critical", () => {
  const result = calculatePriority({
    urgency: 5,
    businessImpact: 5,
    slaDeadline: "2026-10-21T12:00:00.000Z",
    now
  });
  assert.equal(result.deadlineRisk, 5);
  assert.equal(result.score, 55);
  assert.equal(result.priority, "CRITICAL");
});

test("an already overdue claim receives maximum deadline risk", () => {
  const result = calculatePriority({
    urgency: 1,
    businessImpact: 1,
    slaDeadline: "2026-10-19T12:00:00.000Z",
    now
  });
  assert.equal(result.deadlineRisk, 5);
});
