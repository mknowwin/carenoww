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
import Appointment from "./models/Appointment.js";
import Tenant from "./models/Tenant.js";
import reportsRouter from "./routes/reports.js";
import ipdRouter from "./routes/ipd.js";
import prescriptionsRouter from "./routes/prescriptions.js";
import ratemasterRouter from "./routes/ratemaster.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3201;

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
  : ["http://localhost:3200", "http://localhost:5173"];
app.use(cors({ origin: allowedOrigins, credentials: true }));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: "Too many login attempts" } });
const apiLimiter   = rateLimit({ windowMs: 60 * 1000, max: 300 });
const publicLimiter = rateLimit({ windowMs: 60 * 1000, max: 600 });

app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: false }));

// ── Connect to MongoDB ─────────────────────────────────────────────────────────
connectDB().catch((err) => {
  console.error("Failed to connect to MongoDB:", err);
  console.warn("⚠️  Running without database — some routes will not work.");
});

// ── Public display route (no auth — for TV/kiosk token display) ───────────────
// GET /api/public/display?tenantId=xxx  OR  ?slug=xxx
app.get("/api/public/display", publicLimiter, async (req, res) => {
  try {
    const { tenantId, slug } = req.query as Record<string, string>;
    let resolvedTenantId = tenantId;

    if (!resolvedTenantId && slug) {
      const tenant = await (Tenant as any).findOne({ slug });
      if (!tenant) return res.status(404).json({ error: "Clinic not found" });
      resolvedTenantId = tenant._id.toString();
    }

    if (!resolvedTenantId) return res.status(400).json({ error: "tenantId or slug required" });

    const today = new Date().toISOString().split("T")[0];

    const [inConsult, waiting] = await Promise.all([
      Appointment.find({
        tenantId: resolvedTenantId,
        date: today,
        status: "In Consult",
      }).select("token tokenNumber doctor department patientName calledAt"),
      Appointment.aggregate([
        {
          $match: {
            tenantId: { $eq: resolvedTenantId } as any,
            date: today,
            status: "Waiting",
          },
        },
        { $group: { _id: "$doctor", count: { $sum: 1 }, department: { $first: "$department" } } },
      ]),
    ]);

    const waitingMap: Record<string, number> = {};
    waiting.forEach((w: any) => { waitingMap[w._id] = w.count; });

    res.json({
      date: today,
      inConsult: inConsult.map((a) => ({
        token:       a.token,
        tokenNumber: a.tokenNumber,
        doctor:      a.doctor,
        department:  a.department,
        patientName: a.patientName,
        calledAt:    a.calledAt,
      })),
      waitingByDoctor: waitingMap,
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

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
app.use("/api/ratemaster",     ratemasterRouter);

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
  console.log(`\n✅ Carenoww HMS API v2.1 running on port ${PORT}`);
  console.log(`   Environment : ${process.env.NODE_ENV ?? "development"}`);
  console.log(`   Health      : http://localhost:${PORT}/api/health`);
  console.log(`   Display     : http://localhost:${PORT}/api/public/display?tenantId=<id>`);
  console.log(`\n   Superadmin  : ${process.env.SUPERADMIN_EMAIL}`);
  console.log(`   Seed data   : npx tsx server/seed.ts\n`);
});
