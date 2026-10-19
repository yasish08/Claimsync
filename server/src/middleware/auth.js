import jwt from "jsonwebtoken";
import { prisma } from "../db.js";

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: { code: "AUTH_REQUIRED", message: "Sign in to continue." } });
  }
  const token = header.slice(7);
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
      return res.status(503).json({ error: { code: "AUTH_NOT_CONFIGURED", message: "Set a JWT_SECRET of at least 32 characters." } });
    }
    const payload = jwt.verify(token, secret);
    if (typeof payload !== "object" || typeof payload.sub !== "string") throw new Error("Invalid token payload");
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, name: true, email: true, role: true, isActive: true } });
    if (!user || !user.isActive) return res.status(401).json({ error: { code: "ACCOUNT_UNAVAILABLE", message: "This account is unavailable." } });
    req.user = user;
    next();
  } catch (error) {
    if (error?.name === "JsonWebTokenError" || error?.name === "TokenExpiredError" || error?.message === "Invalid token payload") {
      return res.status(401).json({ error: { code: "INVALID_TOKEN", message: "Your session is invalid or expired. Sign in again." } });
    }
    next(error);
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "You do not have permission to perform this action." } });
    }
    next();
  };
}
