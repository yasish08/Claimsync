import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const unreadOnly = req.query.unread === "true";
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id, ...(unreadOnly ? { readAt: null } : {}) },
      include: { claim: { select: { id: true, claimNumber: true, status: true, slaDeadline: true } } },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    res.json({ data: notifications, unreadCount: notifications.filter((item) => !item.readAt).length });
  } catch (error) { next(error); }
});

router.patch("/:id/read", async (req, res, next) => {
  try {
    const result = await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user.id, readAt: null },
      data: { readAt: new Date() }
    });
    if (!result.count) return res.status(404).json({ error: { code: "NOTIFICATION_NOT_FOUND", message: "Unread notification not found." } });
    res.json({ data: { id: req.params.id, read: true } });
  } catch (error) { next(error); }
});

router.patch("/read-all", async (req, res, next) => {
  try {
    const result = await prisma.notification.updateMany({ where: { userId: req.user.id, readAt: null }, data: { readAt: new Date() } });
    res.json({ data: { markedRead: result.count } });
  } catch (error) { next(error); }
});

export default router;
