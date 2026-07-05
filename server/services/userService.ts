import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Appointment from "../models/Appointment.js";
import { AppError } from "../lib/AppError.js";

// Returns all active doctors for the tenant, optionally filtered by department.
// Also computes whether each doctor is available on the requested date.
export async function listDoctors(tenantId: string, department?: string, date?: string) {
  const query: any = { tenantId, role: "doctor", isActive: true };
  if (department) query.department = department;

  const doctors = await User.find(query).select("-passwordHash").sort({ name: 1 });

  // If date provided, count today's appointments per doctor and compute availability
  if (date) {
    const DAY_MAP: Record<number, string> = { 0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat" };
    const dayOfWeek = DAY_MAP[new Date(date).getDay()];

    const apptCounts = await Appointment.aggregate([
      {
        $match: {
          tenantId,
          date,
          status: { $nin: ["Cancelled"] },
        },
      },
      { $group: { _id: "$doctor", count: { $sum: 1 }, doctorId: { $first: "$doctorId" } } },
    ]);
    const countByDoctor: Record<string, number> = {};
    apptCounts.forEach((a) => { countByDoctor[a._id] = a.count; });

    return doctors.map((doc) => {
      const isWorkingDay = doc.schedule?.days?.includes(dayOfWeek) ?? true;
      const bookedCount = countByDoctor[doc.name] ?? 0;
      const schedule = doc.schedule ?? { startTime: "09:00", endTime: "17:00", slotDurationMin: 15, days: [] };

      // Compute total possible slots for the day
      const [sh, sm] = schedule.startTime.split(":").map(Number);
      const [eh, em] = schedule.endTime.split(":").map(Number);
      const totalMinutes = (eh * 60 + em) - (sh * 60 + sm);
      const totalSlots = Math.floor(totalMinutes / (schedule.slotDurationMin || 15));
      const remainingSlots = Math.max(0, totalSlots - bookedCount);

      return {
        ...doc.toObject(),
        consultingFee: doc.consultingFee ?? 0,
        isAvailable: isWorkingDay && remainingSlots > 0,
        isWorkingDay,
        bookedCount,
        totalSlots,
        remainingSlots,
      };
    });
  }

  return doctors.map((d) => ({ ...d.toObject(), consultingFee: d.consultingFee ?? 0 }));
}

export async function listUsers(tenantId: string) {
  return User.find({ tenantId, isActive: true })
    .select("-passwordHash")
    .sort({ createdAt: -1 });
}

export async function createUser(tenantId: string, body: Record<string, any>) {
  const { name, email, password, role, department, specialty, schedule, consultingFee } = body;
  if (!name || !email || !password || !role) {
    throw AppError.badRequest("name, email, password, role are required");
  }
  const exists = await User.findOne({ tenantId, email: email.toLowerCase() });
  if (exists) throw AppError.conflict("Email already in use");

  let user;
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    user = await User.create({
      tenantId,
      name,
      email: email.toLowerCase(),
      passwordHash,
      role,
      department: department || "",
      specialty: specialty || department || "",
      schedule: schedule || undefined,
      consultingFee: consultingFee ?? 0,
      isActive: true,
    });
  } catch (err: any) {
    if (err.code === 11000) throw AppError.conflict("Email already in use");
    throw err;
  }
  const { passwordHash: _, ...userObj } = user.toObject();
  return userObj;
}

export async function getUser(tenantId: string, id: string) {
  const user = await User.findOne({ _id: id, tenantId }).select("-passwordHash");
  if (!user) throw AppError.notFound("User not found");
  return user;
}

export async function updateUser(tenantId: string, id: string, body: Record<string, any>) {
  const updates: any = {};
  const { name, role, department, specialty, schedule, isActive, password, consultingFee } = body;
  if (name)      updates.name      = name;
  if (role)      updates.role      = role;
  if (department    !== undefined) updates.department    = department;
  if (specialty     !== undefined) updates.specialty     = specialty;
  if (schedule      !== undefined) updates.schedule      = schedule;
  if (isActive      !== undefined) updates.isActive      = isActive;
  if (consultingFee !== undefined) updates.consultingFee = consultingFee;
  if (password) updates.passwordHash = await bcrypt.hash(password, 10);

  const user = await User.findOneAndUpdate(
    { _id: id, tenantId },
    { $set: updates },
    { new: true }
  ).select("-passwordHash");
  if (!user) throw AppError.notFound("User not found");
  return user;
}

export async function deactivateUser(tenantId: string, requesterId: string, id: string) {
  if (id === requesterId) {
    throw AppError.badRequest("Cannot deactivate your own account");
  }
  const user = await User.findOneAndUpdate(
    { _id: id, tenantId },
    { isActive: false },
    { new: true }
  ).select("-passwordHash");
  if (!user) throw AppError.notFound("User not found");
  return { message: "User deactivated" };
}
