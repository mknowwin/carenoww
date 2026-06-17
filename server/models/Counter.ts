import mongoose, { Schema, Document } from "mongoose";

export interface ICounter extends Document {
  tenantId: string;
  name: string;
  seq: number;
}

const CounterSchema = new Schema<ICounter>({
  tenantId: { type: String, required: true },
  name:     { type: String, required: true },
  seq:      { type: Number, default: 0 },
});

CounterSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export default mongoose.model<ICounter>("Counter", CounterSchema);
