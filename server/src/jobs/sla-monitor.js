import { prisma } from "../db.js";

const ACTIVE_STATUSES = ["SUBMITTED", "UNDER_REVIEW", "NEEDS_INFORMATION"];

async function notifyClaimOwners(claim, kind, title, message) {
  let recipients = claim.assignments.map((assignment) => assignment.agentId);
  if (!recipients.length) {
    const managers = await prisma.user.findMany({
      where: { isActive: true, role: { in: ["ADMIN", "MANAGER"] } },
      select: { id: true }
    });
    recipients = managers.map((manager) => manager.id);
  }
  for (const userId of new Set(recipients)) {
    await prisma.notification.upsert({
      where: { userId_claimId_kind: { userId, claimId: claim.id, kind } },
      create: { userId, claimId: claim.id, kind, title, message },
      update: {}
    });
  }
}

export async function runSlaCheck(now = new Date()) {
  const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const claims = await prisma.claim.findMany({
    where: { status: { in: ACTIVE_STATUSES }, slaDeadline: { lte: soon } },
    include: { assignments: { where: { status: "ACTIVE" }, select: { agentId: true } } },
    take: 500
  });
  let atRisk = 0;
  let breached = 0;
  for (const claim of claims) {
    if (claim.slaDeadline <= now) {
      await notifyClaimOwners(claim, "SLA_BREACHED", "Claim SLA breached", `Claim ${claim.claimNumber} has passed its SLA deadline.`);
      breached += 1;
    } else {
      await notifyClaimOwners(claim, "SLA_AT_RISK", "Claim SLA at risk", `Claim ${claim.claimNumber} is due within 24 hours.`);
      atRisk += 1;
    }
  }
  return { checked: claims.length, atRisk, breached };
}

export function startSlaMonitor({ intervalMs = 60_000, logger = console } = {}) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await runSlaCheck();
      if (result.atRisk || result.breached) logger.info?.("CLAIMSYNC SLA scan:", result);
    } catch (error) {
      logger.error?.("CLAIMSYNC SLA scan failed:", error.message);
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
