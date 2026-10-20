import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
const roles = new Set(["ADMIN", "MANAGER", "AGENT"]);
router.use(requireAuth);

router.get("/", requireRole("ADMIN", "MANAGER"), async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
      orderBy: [{ isActive: "desc" }, { name: "asc" }]
    });
    res.json({ data: users });
  } catch (error) { next(error); }
});

router.post("/", requireRole("ADMIN"), async (req, res, next) => {
  try {
    const { name, email, password, role = "AGENT" } = req.body ?? {};
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
        typeof password !== "string" || password.length < 12 || password.length > 128 ||
        !roles.has(role)) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Provide a name, valid email, password of 12–128 characters, and supported role." } });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name: name.trim(), email: normalizedEmail, passwordHash, role },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true }
    });
    res.status(201).json({ data: user });
  } catch (error) {
    if (error?.code === "P2002") return res.status(409).json({ error: { code: "EMAIL_ALREADY_EXISTS", message: "An account with that email already exists." } });
    next(error);
  }
});

export default router;
