import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/overview", async (_req, res, next) => {
  try {
    const now = new Date();
    const riskWindow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const openStatuses = ["SUBMITTED", "UNDER_REVIEW", "NEEDS_INFORMATION"];
    const [total, open, resolvedToday, atRisk, statusGroups, typeGroups, recentClaims] = await prisma.$transaction([
      prisma.claim.count(),
      prisma.claim.count({ where: { status: { in: openStatuses } } }),
      prisma.claim.count({ where: { status: { in: ["APPROVED", "REJECTED", "CLOSED"] }, resolvedAt: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } } }),
      prisma.claim.count({ where: { status: { in: openStatuses }, slaDeadline: { lte: riskWindow } } }),
      prisma.claim.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.claim.groupBy({ by: ["type"], _count: { _all: true } }),
      prisma.claim.findMany({ orderBy: [{ priorityScore: "desc" }, { submittedAt: "asc" }], take: 5, select: { id: true, claimNumber: true, type: true, status: true, priority: true, priorityScore: true, slaDeadline: true, submittedAt: true } })
    ]);
    res.json({ data: {
      generatedAt: now.toISOString(),
      metrics: { totalClaims: total, awaitingReview: open, resolvedToday, slaAtRisk: atRisk },
      byStatus: statusGroups.map((item) => ({ status: item.status, count: item._count._all })),
      byType: typeGroups.map((item) => ({ type: item.type, count: item._count._all })),
      topPriority: recentClaims
    } });
  } catch (error) { next(error); }
});

router.get("/agents", requireRole("ADMIN", "MANAGER"), async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { isActive: true, role: { in: ["AGENT", "MANAGER"] } },
      select: { id: true, name: true, email: true, role: true, assignments: { where: { status: "ACTIVE" }, select: { id: true, claimId: true, assignedAt: true } } },
      orderBy: { name: "asc" }
    });
    res.json({ data: users.map(({ assignments, ...user }) => ({ ...user, activeAssignments: assignments.length, assignments })) });
  } catch (error) { next(error); }
});

export default router;
