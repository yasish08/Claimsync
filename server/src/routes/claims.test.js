import test from "node:test";
import assert from "node:assert/strict";
import { calculatePriority } from "./claims.js";

test("priority score rises when deadline risk increases", () => {
  const now = Date.parse("2026-10-19T12:00:00.000Z");
  const safe = calculatePriority({ urgency: 3, businessImpact: 3, slaDeadline: "2026-11-10T12:00:00.000Z", now });
  const urgent = calculatePriority({ urgency: 3, businessImpact: 3, slaDeadline: "2026-10-19T20:00:00.000Z", now });
  assert.ok(urgent.score > safe.score);
  assert.equal(urgent.deadlineRisk, 5);
});

test("priority calculation is deterministic for fixed inputs", () => {
  const result = calculatePriority({ urgency: 5, businessImpact: 5, slaDeadline: "2026-10-20T12:00:00.000Z", now: Date.parse("2026-10-19T12:00:00.000Z") });
  assert.deepEqual(result, { score: 55, deadlineRisk: 5, priority: "CRITICAL" });
});
