// Common HSN codes used in Indian hospital billing
// Healthcare services (SAC 9993) are GST-exempt; pharma products vary by schedule

export interface HsnEntry {
  code: string;
  description: string;
  taxRate: number; // GST %
}

const HSN_MASTER: HsnEntry[] = [
  { code: "9993",  description: "Healthcare services",            taxRate: 0    },
  { code: "9985",  description: "Support services (exempt)",      taxRate: 0    },
  { code: "30049", description: "Medicaments (Schedule H drugs)", taxRate: 12   },
  { code: "30041", description: "Penicillin formulations",        taxRate: 12   },
  { code: "30059", description: "Dressings and bandages",         taxRate: 12   },
  { code: "30069", description: "Surgical gloves / supplies",     taxRate: 18   },
  { code: "90183", description: "Medical instruments / devices",  taxRate: 12   },
  { code: "90212", description: "Orthopaedic implants",           taxRate: 12   },
  { code: "30021", description: "Vaccines",                       taxRate: 5    },
  { code: "38220", description: "Laboratory reagents / kits",     taxRate: 12   },
  { code: "90278", description: "Optical instruments",            taxRate: 18   },
  { code: "84719", description: "Medical imaging equipment",      taxRate: 18   },
];

export function lookupHsn(query: string): HsnEntry | undefined {
  const q = query.toLowerCase();
  return HSN_MASTER.find(
    (h) => h.code === q || h.description.toLowerCase().includes(q)
  );
}

export function hsnForCategory(category: string): HsnEntry {
  const map: Record<string, string> = {
    Consultation: "9993",
    Lab:          "38220",
    Pharmacy:     "30049",
    Procedure:    "9993",
    Bed:          "9993",
    ICU:          "9993",
    Other:        "9993",
  };
  const code = map[category] ?? "9993";
  return HSN_MASTER.find((h) => h.code === code) ?? { code, description: category, taxRate: 0 };
}

export default HSN_MASTER;
