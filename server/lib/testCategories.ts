// Mirrors the modality groupings in client/src/lib/labTestMaster.ts.
// Kept as simple name lists (not shared import) since client/server don't share a module boundary here.
export const CARDIOLOGY_TESTS = ["ECG", "ECHO", "TMT", "Holter", "ABP"];
export const RADIOLOGY_TESTS = ["Chest X-Ray", "USG Abdomen", "MRI Brain", "CT Scan", "Bone Density"];

export function categorizeTest(test: string): "Pathology" | "Radiology" | "Cardiology" | "Other" {
  const hasAny = (names: string[]) => names.some((n) => test.toLowerCase().includes(n.toLowerCase()));
  if (hasAny(CARDIOLOGY_TESTS)) return "Cardiology";
  if (hasAny(RADIOLOGY_TESTS)) return "Radiology";
  return "Pathology";
}
