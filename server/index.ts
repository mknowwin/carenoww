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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3201;

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: ["http://localhost:3200", "http://localhost:5173"], credentials: true }));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: "Too many login attempts" } });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 300 });

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false }));

// ── Connect to MongoDB ─────────────────────────────────────────────────────────
connectDB().catch((err) => {
  console.error("Failed to connect to MongoDB:", err);
  console.warn("⚠️  Running without database — some routes will not work.");
});

// ── API Routes ────────────────────────────────────────────────────────────────
app.use("/api/auth/login", loginLimiter);
app.use("/api/superadmin/login", loginLimiter);
app.use("/api", apiLimiter);

app.use("/api/auth",        authRouter);
app.use("/api/superadmin",  superadminRouter);
app.use("/api/patients",    patientsRouter);
app.use("/api/appointments",appointmentsRouter);
app.use("/api/lab",         labRouter);
app.use("/api/pharmacy",    pharmacyRouter);
app.use("/api/billing",     billingRouter);
app.use("/api/dashboard",   dashboardRouter);
app.use("/api/users",       usersRouter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "Carenoww HMS API",
    version: "2.0.0",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ── Serve static files in production ─────────────────────────────────────────
if (process.env.NODE_ENV === "production") {
  const publicDir = path.join(__dirname, "public");
  app.use(express.static(publicDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅ Carenoww HMS API v2.0 running on port ${PORT}`);
  console.log(`   Environment : ${process.env.NODE_ENV ?? "development"}`);
  console.log(`   Health      : http://localhost:${PORT}/api/health`);
  console.log(`\n   Superadmin  : ${process.env.SUPERADMIN_EMAIL}`);
  console.log(`   Seed data   : npx tsx server/seed.ts\n`);
});
