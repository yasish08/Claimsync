import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const globalForPrisma = globalThis;

export const prisma = globalForPrisma.claimsyncPrisma ?? new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
});

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.claimsyncPrisma = prisma;
}
