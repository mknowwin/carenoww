import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { connectDB } from "./db.js";
import authRouter from "./routes/auth.js";
import superadminRouter from "./routes/superadmin.js";
import patientsRouter from "./routes/patients.js";
import appointmentsRouter from "./routes/appointments.js";
import labRouter from "./routes/lab.js";
import pharmacyRouter from "./routes/pharmacy.js";
import billingRouter from "./routes/billing.js";
import dashboardRouter from "./routes/dashboard.js";
import usersRouter from "./routes/users.js";
import reportsRouter from "./routes/reports.js";
import ipdRouter from "./routes/ipd.js";
import prescriptionsRouter from "./routes/prescriptions.js";
import ratemasterRouter from "./routes/ratemaster.js";
import referralDoctorsRouter from "./routes/referralDoctors.js";
import suppliersRouter from "./routes/suppliers.js";
import { requestIdMiddleware } from "./middleware/requestId.js";
import { notFoundHandler } from "./middleware/notFoundHandler.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { asyncHandler } from "./lib/asyncHandler.js";
import * as publicDisplayService from "./services/publicDisplayService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3201;

// ── Request tracing ───────────────────────────────────────────────────────────
// Must be first so every response — even ones rejected by CORS/rate-limiting — carries an X-Request-Id.
app.use(requestIdMiddleware);

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
  : ["http://localhost:3200", "http://localhost:5173"];
app.use(cors({ origin: allowedOrigins, credentials: true }));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const rateLimitHandler = (code: "RATE_LIMITED", message: string) => (req: express.Request, res: express.Response) => {
  res.status(429).json({
    success: false,
    requestId: req.requestId,
    error: { code, message },
  });
};
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  handler: rateLimitHandler("RATE_LIMITED", "Too many login attempts. Please try again later."),
});
const apiLimiter   = rateLimit({ windowMs: 60 * 1000, max: 300, handler: rateLimitHandler("RATE_LIMITED", "Too many requests. Please try again later.") });
const publicLimiter = rateLimit({ windowMs: 60 * 1000, max: 600, handler: rateLimitHandler("RATE_LIMITED", "Too many requests. Please try again later.") });

app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: false }));

// ── Connect to MongoDB ─────────────────────────────────────────────────────────
connectDB().catch((err) => {
  console.error("Failed to connect to MongoDB:", err);
  console.warn("⚠️  Running without database — some routes will not work.");
});

// ── Public display route (no auth — for TV/kiosk token display) ───────────────
// GET /api/public/display?tenantId=xxx  OR  ?slug=xxx
app.get("/api/public/display", publicLimiter, asyncHandler(async (req, res) => {
  const { tenantId, slug } = req.query as Record<string, string>;
  const data = await publicDisplayService.getDisplayData(tenantId, slug);
  res.json({ success: true, data });
}));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use("/api/auth/login",       loginLimiter);
app.use("/api/superadmin/login", loginLimiter);
app.use("/api",                  apiLimiter);

app.use("/api/auth",         authRouter);
app.use("/api/superadmin",   superadminRouter);
app.use("/api/patients",     patientsRouter);
app.use("/api/appointments", appointmentsRouter);
app.use("/api/lab",          labRouter);
app.use("/api/pharmacy",     pharmacyRouter);
app.use("/api/billing",      billingRouter);
app.use("/api/dashboard",    dashboardRouter);
app.use("/api/users",        usersRouter);
app.use("/api/reports",        reportsRouter);
app.use("/api/ipd",            ipdRouter);
app.use("/api/prescriptions",  prescriptionsRouter);
app.use("/api/ratemaster",        ratemasterRouter);
app.use("/api/referral-doctors",  referralDoctorsRouter);
app.use("/api/suppliers",         suppliersRouter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({
    status:    "ok",
    service:   "Carenoww HMS API",
    version:   "2.1.0",
    timestamp: new Date().toISOString(),
    uptime:    process.uptime(),
  });
});

// ── 404 for unmatched API routes ──────────────────────────────────────────────
// Scoped to /api so it never shadows the SPA static fallback below.
app.use("/api", notFoundHandler);

// ── Serve static files in production ─────────────────────────────────────────
if (process.env.NODE_ENV === "production") {
  const publicDir = path.join(__dirname, "public");
  app.use(express.static(publicDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

// ── Centralized error handler ─────────────────────────────────────────────────
// Must be the last middleware registered.
app.use(errorHandler);

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅ Carenoww HMS API v2.1 running on port ${PORT}`);
  console.log(`   Environment : ${process.env.NODE_ENV ?? "development"}`);
  console.log(`   Health      : http://localhost:${PORT}/api/health`);
  console.log(`   Display     : http://localhost:${PORT}/api/public/display?tenantId=<id>`);
  console.log(`\n   Superadmin  : ${process.env.SUPERADMIN_EMAIL}`);
  console.log(`   Seed data   : npx tsx server/seed.ts\n`);
});
