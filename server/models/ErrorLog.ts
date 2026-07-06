import mongoose, { Schema, Document } from "mongoose";

export interface IErrorLog extends Document {
  tenantId?: mongoose.Types.ObjectId;
  requestId: string;
  userId?: string;
  module: string;
  api: string;
  method: string;
  statusCode: number;
  errorCode: string;
  message: string;
  stack?: string;
  payload?: any;
  params?: any;
  query?: any;
  ipAddress?: string;
  userAgent?: string;
  environment: string;
  createdAt: Date;
  updatedAt: Date;
}

const ErrorLogSchema = new Schema<IErrorLog>(
  {
    // Optional (not required, unlike most tenantId fields) — pre-auth, public,
    // and superadmin requests have no tenant.
    tenantId:    { type: Schema.Types.ObjectId, ref: "Tenant", index: true },
    requestId:   { type: String, required: true },
    userId:      { type: String },
    module:      { type: String, required: true },
    api:         { type: String, required: true },
    method:      { type: String, required: true },
    statusCode:  { type: Number, required: true },
    errorCode:   { type: String, required: true },
    message:     { type: String, required: true },
    stack:       { type: String },
    payload:     { type: Schema.Types.Mixed },
    params:      { type: Schema.Types.Mixed },
    query:       { type: Schema.Types.Mixed },
    ipAddress:   { type: String },
    userAgent:   { type: String },
    environment: { type: String, required: true },
  },
  { timestamps: true }
);

ErrorLogSchema.index({ tenantId: 1, createdAt: -1 });
ErrorLogSchema.index({ requestId: 1 });

export default mongoose.model<IErrorLog>("ErrorLog", ErrorLogSchema);
