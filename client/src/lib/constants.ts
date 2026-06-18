export const DRUG_UNITS = [
  "Tab",
  "Cap",
  "Syrup",
  "Vial",
  "Ampoule",
  "Inj",
  "Strip",
  "Sachet",
  "Cream",
  "Powder",
  "Drops",
  "Bottle",
  "Other",
] as const;

export type DrugUnit = (typeof DRUG_UNITS)[number];
