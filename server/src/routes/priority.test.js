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

test("priority deadline risk changes at the documented 24, 72 and 168 hour boundaries", () => {
  const at = (hours) => calculatePriority({
    urgency: 1,
    businessImpact: 1,
    slaDeadline: new Date(now + hours * 60 * 60 * 1000),
    now
  }).deadlineRisk;

  assert.equal(at(24), 5);
  assert.equal(at(24.01), 4);
  assert.equal(at(72), 4);
  assert.equal(at(72.01), 2);
  assert.equal(at(168), 2);
  assert.equal(at(168.01), 1);
});

test("priority scorer remains deterministic for the same inputs", () => {
  const input = {
    urgency: 4,
    businessImpact: 2,
    slaDeadline: "2026-10-23T12:00:00.000Z",
    now
  };
  assert.deepEqual(calculatePriority(input), calculatePriority(input));
});
