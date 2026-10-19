import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/db.js";

const { BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD } = process.env;
if (!BOOTSTRAP_ADMIN_NAME || !BOOTSTRAP_ADMIN_EMAIL || !BOOTSTRAP_ADMIN_PASSWORD) {
  throw new Error("Set BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL, and BOOTSTRAP_ADMIN_PASSWORD before seeding.");
}
if (BOOTSTRAP_ADMIN_PASSWORD.length < 12) throw new Error("Bootstrap admin password must be at least 12 characters.");

try {
  const existingAdmin = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });
  if (existingAdmin) throw new Error("An admin already exists; refusing to create or reset another admin.");
  const passwordHash = await bcrypt.hash(BOOTSTRAP_ADMIN_PASSWORD, 12);
  const user = await prisma.user.create({
    data: { name: BOOTSTRAP_ADMIN_NAME.trim(), email: BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase(), passwordHash, role: "ADMIN" },
    select: { id: true, name: true, email: true, role: true }
  });
  console.log("Created initial administrator:", user.email);
} finally {
  await prisma.$disconnect();
}
