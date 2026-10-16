import { Router } from "express";
import { prisma } from "../db.js";

const router = Router();
const allowedTypes = new Set(["AUTO", "HEALTH", "PROPERTY", "TRAVEL", "LIFE", "OTHER"]);
const allowedStatuses = new Set(["SUBMITTED", "UNDER_REVIEW", "NEEDS_INFORMATION", "APPROVED", "REJECTED", "CLOSED"]);

function calculatePriority({ urgency, businessImpact, slaDeadline }) {
  const hoursRemaining = (new Date(slaDeadline).getTime() - Date.now()) / 3_600_000;
  const deadlineRisk = hoursRemaining <= 24 ? 5 : hoursRemaining <= 72 ? 4 : hoursRemaining <= 168 ? 2 : 1;
  const score = (5 * urgency) + (4 * deadlineRisk) + (2 * businessImpact);
  const priority = score >= 45 ? "CRITICAL" : score >= 35 ? "HIGH" : score >= 25 ? "MEDIUM" : "LOW";
  return { score, priority };
}

function createClaimNumber() {
  const date = new Date();
  const day = date.toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `CLM-${day}-${suffix}`;
}

router.get("/", async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 20));
    const status = typeof req.query.status === "string" ? req.query.status.toUpperCase() : undefined;
    const type = typeof req.query.type === "string" ? req.query.type.toUpperCase() : undefined;
    if (status && !allowedStatuses.has(status)) return res.status(400).json({ error: { code: "INVALID_STATUS", message: "Unsupported claim status filter." } });
    if (type && !allowedTypes.has(type)) return res.status(400).json({ error: { code: "INVALID_TYPE", message: "Unsupported claim type filter." } });
    const where = {};
    if (status) where.status = status;
    if (type) where.type = type;
    const [items, total] = await prisma.$transaction([
      prisma.claim.findMany({
        where,
        orderBy: [{ priorityScore: "desc" }, { submittedAt: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { assignments: { where: { status: "ACTIVE" }, include: { agent: { select: { id: true, name: true, email: true } } } } }
      }),
      prisma.claim.count({ where })
    ]);
    res.json({ data: items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const claim = await prisma.claim.findUnique({
      where: { id: req.params.id },
      include: {
        assignments: { include: { agent: { select: { id: true, name: true, email: true } } } },
        history: { orderBy: { createdAt: "desc" }, take: 100 }
      }
    });
    if (!claim) return res.status(404).json({ error: { code: "CLAIM_NOT_FOUND", message: "Claim not found." } });
    res.json({ data: claim });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { claimantName, claimantEmail, policyNumber, type, description, estimatedAmount, urgency = 3, businessImpact = 3, slaDeadline } = req.body ?? {};
    const errors = {};
    if (typeof claimantName !== "string" || claimantName.trim().length < 2 || claimantName.trim().length > 120) errors.claimantName = "Enter a name between 2 and 120 characters.";
    if (typeof claimantEmail !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claimantEmail)) errors.claimantEmail = "Enter a valid email address.";
    if (typeof policyNumber !== "string" || policyNumber.trim().length < 3 || policyNumber.trim().length > 80) errors.policyNumber = "Enter a policy number between 3 and 80 characters.";
    if (!allowedTypes.has(type)) errors.type = "Choose a supported claim type.";
    if (typeof description !== "string" || description.trim().length < 10 || description.trim().length > 5000) errors.description = "Description must be between 10 and 5000 characters.";
    const amount = Number(estimatedAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) errors.estimatedAmount = "Enter a positive amount within the supported range.";
    if (!Number.isInteger(urgency) || urgency < 1 || urgency > 5) errors.urgency = "Urgency must be an integer from 1 to 5.";
    if (!Number.isInteger(businessImpact) || businessImpact < 1 || businessImpact > 5) errors.businessImpact = "Business impact must be an integer from 1 to 5.";
    const deadline = new Date(slaDeadline);
    if (typeof slaDeadline !== "string" || !Number.isFinite(deadline.getTime()) || deadline.getTime() <= Date.now()) errors.slaDeadline = "Choose a future SLA deadline.";
    if (Object.keys(errors).length) return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Please correct the claim details.", fields: errors } });

    const { score, priority } = calculatePriority({ urgency, businessImpact, slaDeadline: deadline });
    const claim = await prisma.claim.create({
      data: {
        claimNumber: createClaimNumber(),
        claimantName: claimantName.trim(),
        claimantEmail: claimantEmail.trim().toLowerCase(),
        policyNumber: policyNumber.trim(),
        type,
        description: description.trim(),
        estimatedAmount: amount,
        urgency,
        businessImpact,
        priorityScore: score,
        priority,
        slaDeadline: deadline,
        history: { create: { action: "CLAIM_SUBMITTED", toStatus: "SUBMITTED", note: "Claim submitted through intake API." } }
      }
    });
    res.status(201).json({ data: claim });
  } catch (error) {
    next(error);
  }
});

export default router;
