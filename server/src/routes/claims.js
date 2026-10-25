import { Router } from "express";
import { randomUUID } from "node:crypto";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { enqueueClaim, removeClaimFromQueue, withRedis } from "../redis.js";

const router = Router();
router.use(requireAuth);
const types = new Set(["AUTO", "HEALTH", "PROPERTY", "TRAVEL", "LIFE", "OTHER"]);
const statuses = new Set(["SUBMITTED", "UNDER_REVIEW", "NEEDS_INFORMATION", "APPROVED", "REJECTED", "CLOSED"]);
const transitions = {
  SUBMITTED: ["UNDER_REVIEW", "CLOSED"],
  UNDER_REVIEW: ["NEEDS_INFORMATION", "APPROVED", "REJECTED", "CLOSED"],
  NEEDS_INFORMATION: ["UNDER_REVIEW", "CLOSED"],
  APPROVED: ["CLOSED"], REJECTED: ["CLOSED"], CLOSED: []
};

async function notifyClaimStakeholders(claimId, kind, title, message) {
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    include: { assignments: { where: { status: "ACTIVE" }, select: { agentId: true } } }
  });
  if (!claim) return;
  let userIds = claim.assignments.map((assignment) => assignment.agentId);
  if (!userIds.length) {
    const managers = await prisma.user.findMany({
      where: { isActive: true, role: { in: ["ADMIN", "MANAGER"] } },
      select: { id: true }
    });
    userIds = managers.map((manager) => manager.id);
  }
  for (const userId of new Set(userIds)) {
    await prisma.notification.upsert({
      where: { userId_claimId_kind: { userId, claimId, kind } },
      create: { userId, claimId, kind, title, message },
      update: { title, message, createdAt: new Date(), readAt: null }
    });
  }
}

export function calculatePriority({ urgency, businessImpact, slaDeadline, now = Date.now() }) {
  const hours = (new Date(slaDeadline).getTime() - now) / 3600000;
  const deadlineRisk = hours <= 24 ? 5 : hours <= 72 ? 4 : hours <= 168 ? 2 : 1;
  const score = 5 * urgency + 4 * deadlineRisk + 2 * businessImpact;
  return { score, deadlineRisk, priority: score >= 45 ? "CRITICAL" : score >= 35 ? "HIGH" : score >= 25 ? "MEDIUM" : "LOW" };
}

router.get("/", async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 20));
    const status = typeof req.query.status === "string" ? req.query.status.toUpperCase() : undefined;
    const type = typeof req.query.type === "string" ? req.query.type.toUpperCase() : undefined;
    if (status && !statuses.has(status)) return res.status(400).json({ error: { code: "INVALID_STATUS", message: "Unsupported status filter." } });
    if (type && !types.has(type)) return res.status(400).json({ error: { code: "INVALID_TYPE", message: "Unsupported claim type filter." } });
    const where = { ...(status ? { status } : {}), ...(type ? { type } : {}) };
    const [data, total] = await prisma.$transaction([
      prisma.claim.findMany({ where, orderBy: [{ priorityScore: "desc" }, { submittedAt: "asc" }], skip: (page - 1) * pageSize, take: pageSize,
        include: { assignments: { where: { status: "ACTIVE" }, include: { agent: { select: { id: true, name: true, email: true } } } } } }),
      prisma.claim.count({ where })
    ]);
    res.json({ data, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  } catch (error) { next(error); }
});

router.get("/priority-queue", async (_req, res, next) => {
  try {
    try {
      const ids = await withRedis((redis) => redis.zrevrange("claimsync:priority-queue", 0, 49));
      if (ids.length) {
        const activeWhere = { status: { in: ["SUBMITTED", "UNDER_REVIEW", "NEEDS_INFORMATION"] } };
        const [queuedRecords, databaseTop] = await Promise.all([
          prisma.claim.findMany({ where: { id: { in: ids }, ...activeWhere } }),
          prisma.claim.findMany({ where: activeWhere, orderBy: [{ priorityScore: "desc" }, { submittedAt: "asc" }], take: 50 })
        ]);
        const byId = new Map([...queuedRecords, ...databaseTop].map((claim) => [claim.id, claim]));
        const orderedIds = [...ids.filter((id) => byId.has(id)), ...databaseTop.map((claim) => claim.id).filter((id) => !ids.includes(id))];
        const data = orderedIds.slice(0, 50).map((id) => byId.get(id));
        return res.json({ data, source: "redis+database-reconciled", count: data.length });
      }
      const records = await prisma.claim.findMany({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW", "NEEDS_INFORMATION"] } }, orderBy: [{ priorityScore: "desc" }, { submittedAt: "asc" }], take: 50 });
      return res.json({ data: records, source: "database-fallback", count: records.length });
    } catch {
      const records = await prisma.claim.findMany({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW", "NEEDS_INFORMATION"] } }, orderBy: [{ priorityScore: "desc" }, { submittedAt: "asc" }], take: 50 });
      return res.json({ data: records, source: "database-fallback", count: records.length });
    }
  } catch (error) { next(error); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const data = await prisma.claim.findUnique({ where: { id: req.params.id }, include: {
      assignments: { include: { agent: { select: { id: true, name: true, email: true } } } },
      history: { orderBy: { createdAt: "desc" }, take: 100 }
    } });
    if (!data) return res.status(404).json({ error: { code: "CLAIM_NOT_FOUND", message: "Claim not found." } });
    res.json({ data });
  } catch (error) { next(error); }
});

router.post("/", async (req, res, next) => {
  try {
    const { claimantName, claimantEmail, policyNumber, type, description, estimatedAmount, urgency = 3, businessImpact = 3, slaDeadline } = req.body ?? {};
    const errors = {};
    if (typeof claimantName !== "string" || claimantName.trim().length < 2 || claimantName.trim().length > 120) errors.claimantName = "Enter a name between 2 and 120 characters.";
    if (typeof claimantEmail !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claimantEmail)) errors.claimantEmail = "Enter a valid email.";
    if (typeof policyNumber !== "string" || policyNumber.trim().length < 3 || policyNumber.trim().length > 80) errors.policyNumber = "Enter a policy number between 3 and 80 characters.";
    if (!types.has(type)) errors.type = "Choose a supported claim type.";
    if (typeof description !== "string" || description.trim().length < 10 || description.trim().length > 5000) errors.description = "Description must be 10–5000 characters.";
    const amount = Number(estimatedAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) errors.estimatedAmount = "Enter a positive valid amount.";
    if (!Number.isInteger(urgency) || urgency < 1 || urgency > 5) errors.urgency = "Urgency must be 1–5.";
    if (!Number.isInteger(businessImpact) || businessImpact < 1 || businessImpact > 5) errors.businessImpact = "Business impact must be 1–5.";
    const deadline = new Date(slaDeadline);
    if (typeof slaDeadline !== "string" || !Number.isFinite(deadline.getTime()) || deadline.getTime() <= Date.now()) errors.slaDeadline = "Choose a future SLA deadline.";
    if (Object.keys(errors).length) return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Correct the claim details.", fields: errors } });
    const { score, priority } = calculatePriority({ urgency, businessImpact, slaDeadline: deadline });
    const data = await prisma.claim.create({ data: {
      claimNumber: `CLM-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`,
      claimantName: claimantName.trim(), claimantEmail: claimantEmail.trim().toLowerCase(), policyNumber: policyNumber.trim(),
      type, description: description.trim(), estimatedAmount: amount, urgency, businessImpact, priorityScore: score, priority, slaDeadline: deadline,
      history: { create: { action: "CLAIM_SUBMITTED", toStatus: "SUBMITTED", actorId: req.user.id, note: "Submitted through intake API." } }
    } });
    try { await enqueueClaim(data); } catch (queueError) { console.warn("Claim saved but Redis enqueue failed:", queueError.message); }
    res.status(201).json({ data });
  } catch (error) { next(error); }
});

router.patch("/:id/status", async (req, res, next) => {
  try {
    const nextStatus = typeof req.body?.status === "string" ? req.body.status.toUpperCase() : "";
    const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 1000) : "";
    if (!statuses.has(nextStatus)) return res.status(400).json({ error: { code: "INVALID_STATUS", message: "Choose a supported status." } });
    if (["APPROVED", "REJECTED"].includes(nextStatus) && !["ADMIN", "MANAGER"].includes(req.user.role)) return res.status(403).json({ error: { code: "DECISION_REQUIRES_MANAGER", message: "Only managers or admins can approve or reject claims." } });
    const result = await prisma.$transaction(async tx => {
      const claim = await tx.claim.findUnique({ where: { id: req.params.id } });
      if (!claim) return { kind: "missing" };
      if (!transitions[claim.status]?.includes(nextStatus)) return { kind: "invalid", status: claim.status };
      const data = await tx.claim.update({ where: { id: claim.id }, data: { status: nextStatus, resolvedAt: ["APPROVED", "REJECTED", "CLOSED"].includes(nextStatus) ? new Date() : null } });
      await tx.claimHistory.create({ data: { claimId: claim.id, actorId: req.user.id, action: "STATUS_CHANGED", fromStatus: claim.status, toStatus: nextStatus, note: note || null } });
      return { data };
    });
    if (result.kind === "missing") return res.status(404).json({ error: { code: "CLAIM_NOT_FOUND", message: "Claim not found." } });
    if (result.kind === "invalid") return res.status(409).json({ error: { code: "INVALID_TRANSITION", message: `Cannot move claim from ${result.status} to ${nextStatus}.` } });
    try { if (["APPROVED", "REJECTED", "CLOSED"].includes(nextStatus)) await removeClaimFromQueue(result.data.id); else await enqueueClaim(result.data); } catch (queueError) { console.warn("Claim status saved but Redis sync failed:", queueError.message); }
    try { await notifyClaimStakeholders(result.data.id, "STATUS_CHANGED", "Claim status updated", `Claim ${result.data.claimNumber} moved to ${nextStatus.replaceAll("_", " ")}.`); } catch (notificationError) { console.warn("Claim status saved but notification failed:", notificationError.message); }
    res.json({ data: result.data });
  } catch (error) { next(error); }
});

router.post("/:id/assign", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const requestedAgentId = req.body?.agentId;
    const agentId = typeof requestedAgentId === "string" && requestedAgentId.trim() ? requestedAgentId : null;
    const result = await prisma.$transaction(async (tx) => {
      const claim = await tx.claim.findUnique({ where: { id: req.params.id } });
      if (!claim) return { kind: "claim-missing" };
      const activeAssignments = await tx.claimAssignment.findMany({
        where: { claimId: claim.id, status: "ACTIVE" },
        include: { agent: { select: { name: true } } }
      });
      if (!agentId) {
        if (!activeAssignments.length) return { kind: "already-unassigned", claimNumber: claim.claimNumber };
        await tx.claimAssignment.updateMany({
          where: { claimId: claim.id, status: "ACTIVE" },
          data: { status: "REASSIGNED", completedAt: new Date() }
        });
        await tx.claimHistory.create({
          data: { claimId: claim.id, actorId: req.user.id, action: "CLAIM_UNASSIGNED", note: "Active assignment cleared.", metadata: { previousAgentIds: activeAssignments.map((assignment) => assignment.agentId) } }
        });
        return { kind: "unassigned", claimNumber: claim.claimNumber };
      }
      const agent = await tx.user.findUnique({ where: { id: agentId } });
      if (!agent || !agent.isActive || !["AGENT", "MANAGER"].includes(agent.role)) return { kind: "agent-invalid" };
      await tx.claimAssignment.updateMany({ where: { claimId: claim.id, status: "ACTIVE" }, data: { status: "REASSIGNED", completedAt: new Date() } });
      const assignment = await tx.claimAssignment.create({ data: { claimId: claim.id, agentId: agent.id, assignedBy: req.user.id } });
      await tx.claimHistory.create({ data: { claimId: claim.id, actorId: req.user.id, action: "CLAIM_ASSIGNED", note: `Assigned to ${agent.name}.`, metadata: { agentId: agent.id } } });
      return { kind: "assigned", assignment, agentId: agent.id, claimNumber: claim.claimNumber };
    });
    if (result.kind === "claim-missing") return res.status(404).json({ error: { code: "CLAIM_NOT_FOUND", message: "Claim not found." } });
    if (result.kind === "agent-invalid") return res.status(400).json({ error: { code: "INVALID_AGENT", message: "Choose an active agent or manager." } });
    if (result.kind === "already-unassigned") return res.json({ data: null, message: "Claim is already unassigned." });
    if (result.kind === "unassigned") return res.json({ data: null, message: "Claim unassigned." });
    try {
      await prisma.notification.upsert({
        where: { userId_claimId_kind: { userId: result.assignment.agentId, claimId: req.params.id, kind: "CLAIM_ASSIGNED" } },
        create: { userId: result.assignment.agentId, claimId: req.params.id, kind: "CLAIM_ASSIGNED", title: "Claim assigned to you", message: `You have been assigned claim ${result.claimNumber}.` },
        update: { title: "Claim assigned to you", message: `You have been assigned claim ${result.claimNumber}.`, createdAt: new Date(), readAt: null }
      });
    } catch (notificationError) { console.warn("Claim assigned but notification failed:", notificationError.message); }
    res.status(201).json({ data: result.assignment });
  } catch (error) { next(error); }
});

export default router;
