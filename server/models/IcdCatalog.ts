import mongoose, { Schema, Document } from "mongoose";

// Global, read-only ICD-10-CM catalogue shared by all tenants (no tenantId).
// Loaded by `npm run icd:import` from the CMS order file. Each tenant's own
// IcdCode list layers on top: favourites/custom codes first, inactive ones hidden.
export interface IIcdCatalog extends Document {
  code: string;         // dotted, e.g. "E11.9"
  description: string;  // CMS long description
  billable: boolean;    // false = category heading (e.g. "E11")
  words: string[];      // lowercase description tokens, for indexed prefix search
  version: string;      // CMS fiscal year, e.g. "2026"
}

const IcdCatalogSchema = new Schema<IIcdCatalog>(
  {
    code:        { type: String, required: true },
    description: { type: String, required: true },
    billable:    { type: Boolean, default: true },
    words:       { type: [String], default: [] },
    version:     { type: String, required: true },
  },
  { collection: "icdcatalog" }
);

IcdCatalogSchema.index({ code: 1 }, { unique: true });
IcdCatalogSchema.index({ words: 1 });

export const icdWords = (description: string) =>
  [...new Set(description.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean))];

export default mongoose.model<IIcdCatalog>("IcdCatalog", IcdCatalogSchema);
