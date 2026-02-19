// backend/src/server.ts
import "dotenv/config";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { connectDB } from "./db.js";
import { businessRouter } from "./routes/businessRoutes.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { debugRouter } from "./routes/debug.js";
import { projectsRouter } from "./routes/projects.js";
import { authRouter } from "./routes/auth.js";
import { accountsRouter } from "./routes/accounts.js";

const app = express();

// ─── Security & Basic Middleware ───────────────────────────────────────────────
app.use(helmet());

// Allowed frontend origins (from env or defaults)
const FRONTEND_ORIGINS = (process.env.FRONTEND_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const defaultOrigins = ["http://localhost:5173", "http://localhost:5174"];
const allowedOrigins = Array.from(new Set([...defaultOrigins, ...FRONTEND_ORIGINS, "https://eklogi-qai-v3wn.onrender.com"]));

// Main CORS middleware
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // allow server-to-server or curl
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"), false);
    },
    credentials: true,
  })
);

// 🔹 Extra middleware to guarantee CORS headers (safety net)
app.use((req, res, next) => {
  const origin = (req.headers.origin as string) || "";
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  }
  if (req.method === "OPTIONS") return res.status(204).end();
  return next();
});

app.use(express.json());

// ─── Routes ────────────────────────────────────────────────────────────────────
app.use("/debug", debugRouter);
app.use("/auth", authRouter);
app.use("/api/auth", authRouter);
app.use("/accounts", accountsRouter);
app.use("/api/accounts", accountsRouter);
app.use("/api/business", businessRouter);
app.use("/api/projects", projectsRouter);
app.use("/dashboard", dashboardRouter);

// Health check
app.get("/health", (_req, res) => res.json({ ok: true }));

// 404 handler (JSON response for unknown routes)
app.use((req: Request, res: Response) => {
  res.status(404).json({ ok: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
});

// Error handler (normalize all thrown errors into JSON)
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = Number(err?.status || err?.statusCode || 500);
  const message = status === 500 ? "Internal server error" : String(err?.message || "Request failed");
  if (status >= 500) console.error("❌ Unhandled error:", err);
  res.status(status).json({ ok: false, message });
});

// ─── Startup ───────────────────────────────────────────────────────────────────
(async () => {
  try {
    await connectDB();

    const PORT = Number(process.env.PORT || 5004);

    console.log("✅ MongoDB connected");
    console.log("🔑 OpenAI key prefix:", process.env.OPENAI_API_KEY?.slice(0, 8));
    console.log("🌍 Allowed CORS origins:", allowedOrigins);

    app.listen(PORT, () => {
      console.log(`🚀 API listening on :${PORT}`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
})();
