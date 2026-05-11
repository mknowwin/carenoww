import mongoose, { Schema, Document } from "mongoose";

export type UserRole = "admin" | "doctor" | "nurse" | "receptionist" | "pharmacist" | "lab_tech" | "finance";

export interface IUser extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  department: string;
  isActive: boolean;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["admin", "doctor", "nurse", "receptionist", "pharmacist", "lab_tech", "finance"],
      required: true,
    },
    department: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date },
  },
  { timestamps: true }
);

// Unique email per tenant
UserSchema.index({ tenantId: 1, email: 1 }, { unique: true });

export default mongoose.model<IUser>("User", UserSchema);
