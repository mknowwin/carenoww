import mongoose, { Schema, Document } from "mongoose";

export type UserRole = "admin" | "doctor" | "nurse" | "receptionist" | "pharmacist" | "lab_tech" | "finance";

export interface IDoctorSchedule {
  days: string[];      // e.g. ["Mon","Tue","Wed","Thu","Fri"]
  startTime: string;   // "09:00"
  endTime: string;     // "17:00"
  slotDurationMin: number; // 15
}

export interface IUser extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  department: string;
  specialty: string;
  schedule: IDoctorSchedule;
  isActive: boolean;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
  aiScribeEnabled?: boolean;
  aiScribeProvider?: string;
  aiScribeApiKey?: string;
  aiScribeModel?: string;
}

const DoctorScheduleSchema = new Schema<IDoctorSchedule>(
  {
    days:            { type: [String], default: ["Mon", "Tue", "Wed", "Thu", "Fri"] },
    startTime:       { type: String,   default: "09:00" },
    endTime:         { type: String,   default: "17:00" },
    slotDurationMin: { type: Number,   default: 15 },
  },
  { _id: false }
);

const UserSchema = new Schema<IUser>(
  {
    tenantId:  { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    name:      { type: String, required: true, trim: true },
    email:     { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["admin", "doctor", "nurse", "receptionist", "pharmacist", "lab_tech", "finance"],
      required: true,
    },
    department: { type: String, default: "" },
    specialty:  { type: String, default: "" },
    schedule: {
      type: DoctorScheduleSchema,
      default: () => ({ days: ["Mon","Tue","Wed","Thu","Fri"], startTime: "09:00", endTime: "17:00", slotDurationMin: 15 }),
    },
    isActive:  { type: Boolean, default: true },
    lastLogin: { type: Date },
    aiScribeEnabled:  { type: Boolean, default: false },
    aiScribeProvider: { type: String,  default: "deepgram" },
    aiScribeApiKey:   { type: String,  default: "" },
    aiScribeModel:    { type: String,  default: "nova-2-medical" },
  },
  { timestamps: true }
);

UserSchema.index({ tenantId: 1, email: 1 }, { unique: true });

export default mongoose.model<IUser>("User", UserSchema);
