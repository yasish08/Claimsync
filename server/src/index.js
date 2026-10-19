import dotenv from "dotenv";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";
import cors from "cors";
import claimsRouter from "./routes/claims.js";
import authRouter from "./routes/auth.js";
import usersRouter from "./routes/users.js";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const app = express();
const port = Number(process.env.PORT) || 4000;
const clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173";

app.disable("x-powered-by");
app.use(cors({ origin: clientOrigin }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "claimsync-api",
    timestamp: new Date().toISOString(),
    version: "0.1.0"
  });
});

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/claims", claimsRouter);

app.use("/api", (_req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "The requested API endpoint does not exist."
    }
  });
});

app.use((err, _req, res, _next) => {
  if (err?.code === "P2021" || err?.code === "P2022") {
    return res.status(503).json({ error: { code: "DATABASE_NOT_READY", message: "The database schema is not ready. Run the Prisma migration first." } });
  }
  if (err?.code === "P2002") return res.status(409).json({ error: { code: "DUPLICATE_RECORD", message: "A record with this unique value already exists." } });
  console.error("Unhandled API error:", err);
  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Something went wrong. Please try again."
    }
  });
});

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) {
  app.listen(port, () => {
    console.log(`CLAIMSYNC API listening on http://localhost:${port}`);
  });
}

export default app;
