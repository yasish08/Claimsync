import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/login", async (req, res, next) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!email || !password || email.length > 254 || password.length > 128) {
      return res.status(400).json({ error: { code: "INVALID_CREDENTIALS_INPUT", message: "Enter your email and password." } });
    }
    const user = await prisma.user.findUnique({ where: { email } });
    const valid = user && user.isActive && await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } });
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) return res.status(503).json({ error: { code: "AUTH_NOT_CONFIGURED", message: "Set a JWT_SECRET of at least 32 characters." } });
    const expiresIn = process.env.JWT_EXPIRES_IN || "1h";
    const token = jwt.sign({ role: user.role }, secret, { subject: user.id, expiresIn, issuer: "claimsync-api", audience: "claimsync-client" });
    res.json({ data: { token, tokenType: "Bearer", expiresIn, user: { id: user.id, name: user.name, email: user.email, role: user.role } } });
  } catch (error) { next(error); }
});

router.get("/me", requireAuth, (req, res) => res.json({ data: { user: req.user } }));

export default router;
