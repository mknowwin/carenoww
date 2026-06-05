export interface TestParameter {
  name: string;
  unit: string;
  referenceRange: string;
  defaultValue: string;
}

export interface LabTestMaster {
  [testName: string]: TestParameter[];
}

export const LAB_TEST_MASTER: LabTestMaster = {
  "CBC": [
    { name: "WBC (White Blood Cells)",    unit: "× 10³/µL", referenceRange: "4.0 – 11.0",   defaultValue: "7.5"  },
    { name: "RBC (Red Blood Cells)",       unit: "× 10⁶/µL", referenceRange: "4.2 – 5.9",   defaultValue: "5.0"  },
    { name: "Hemoglobin",                  unit: "g/dL",      referenceRange: "12.0 – 17.5", defaultValue: "14.0" },
    { name: "Hematocrit (PCV)",            unit: "%",         referenceRange: "36 – 52",      defaultValue: "42"   },
    { name: "MCV",                         unit: "fL",        referenceRange: "80 – 100",     defaultValue: "90"   },
    { name: "MCH",                         unit: "pg",        referenceRange: "27 – 33",      defaultValue: "30"   },
    { name: "MCHC",                        unit: "g/dL",      referenceRange: "32 – 36",      defaultValue: "34"   },
    { name: "Platelets",                   unit: "× 10³/µL", referenceRange: "150 – 400",    defaultValue: "250"  },
    { name: "Neutrophils",                 unit: "%",         referenceRange: "40 – 75",      defaultValue: "60"   },
    { name: "Lymphocytes",                 unit: "%",         referenceRange: "20 – 45",      defaultValue: "30"   },
    { name: "Monocytes",                   unit: "%",         referenceRange: "2 – 10",       defaultValue: "6"    },
    { name: "Eosinophils",                 unit: "%",         referenceRange: "1 – 6",        defaultValue: "3"    },
  ],
  "CRP": [
    { name: "C-Reactive Protein",          unit: "mg/L",      referenceRange: "< 5.0",        defaultValue: "2.0"  },
  ],
  "ESR": [
    { name: "Erythrocyte Sedimentation Rate", unit: "mm/hr", referenceRange: "0 – 20 (M) / 0 – 30 (F)", defaultValue: "10" },
  ],
  "Blood Culture": [
    { name: "Organism Isolated",           unit: "",          referenceRange: "No Growth",    defaultValue: "No Growth" },
    { name: "Sensitivity",                 unit: "",          referenceRange: "—",            defaultValue: "—"    },
    { name: "Incubation Period",           unit: "days",      referenceRange: "5",            defaultValue: "5"    },
  ],
  "Urine R/E": [
    { name: "Colour",                      unit: "",          referenceRange: "Yellow",       defaultValue: "Yellow"   },
    { name: "Appearance",                  unit: "",          referenceRange: "Clear",        defaultValue: "Clear"    },
    { name: "pH",                          unit: "",          referenceRange: "4.5 – 8.0",   defaultValue: "6.0"  },
    { name: "Specific Gravity",            unit: "",          referenceRange: "1.005 – 1.030", defaultValue: "1.015" },
    { name: "Protein",                     unit: "",          referenceRange: "Nil",          defaultValue: "Nil"  },
    { name: "Glucose",                     unit: "",          referenceRange: "Nil",          defaultValue: "Nil"  },
    { name: "Ketones",                     unit: "",          referenceRange: "Nil",          defaultValue: "Nil"  },
    { name: "RBC",                         unit: "/HPF",      referenceRange: "0 – 2",        defaultValue: "0"    },
    { name: "WBC / Pus Cells",             unit: "/HPF",      referenceRange: "0 – 5",        defaultValue: "2"    },
    { name: "Epithelial Cells",            unit: "/HPF",      referenceRange: "Few",          defaultValue: "Few"  },
    { name: "Casts",                       unit: "",          referenceRange: "Nil",          defaultValue: "Nil"  },
  ],
  "Random Blood Sugar": [
    { name: "Glucose (Random)",            unit: "mg/dL",     referenceRange: "70 – 199",     defaultValue: "110"  },
  ],
  "Fasting Blood Sugar": [
    { name: "Glucose (Fasting)",           unit: "mg/dL",     referenceRange: "70 – 99",      defaultValue: "90"   },
  ],
  "HbA1c": [
    { name: "Glycated Haemoglobin (HbA1c)", unit: "%",        referenceRange: "< 5.7",        defaultValue: "5.4"  },
    { name: "eAG (Estimated Avg Glucose)", unit: "mg/dL",     referenceRange: "< 117",        defaultValue: "108"  },
  ],
  "Lipid Profile": [
    { name: "Total Cholesterol",           unit: "mg/dL",     referenceRange: "< 200",        defaultValue: "180"  },
    { name: "LDL Cholesterol",             unit: "mg/dL",     referenceRange: "< 100",        defaultValue: "90"   },
    { name: "HDL Cholesterol",             unit: "mg/dL",     referenceRange: "> 40 (M) / > 50 (F)", defaultValue: "50" },
    { name: "Triglycerides",               unit: "mg/dL",     referenceRange: "< 150",        defaultValue: "120"  },
    { name: "VLDL Cholesterol",            unit: "mg/dL",     referenceRange: "2 – 30",       defaultValue: "24"   },
    { name: "Non-HDL Cholesterol",         unit: "mg/dL",     referenceRange: "< 130",        defaultValue: "110"  },
  ],
  "LFT": [
    { name: "Total Bilirubin",             unit: "mg/dL",     referenceRange: "0.2 – 1.2",   defaultValue: "0.8"  },
    { name: "Direct Bilirubin",            unit: "mg/dL",     referenceRange: "0.0 – 0.4",   defaultValue: "0.2"  },
    { name: "Indirect Bilirubin",          unit: "mg/dL",     referenceRange: "0.2 – 0.8",   defaultValue: "0.6"  },
    { name: "SGOT / AST",                  unit: "U/L",       referenceRange: "10 – 40",      defaultValue: "25"   },
    { name: "SGPT / ALT",                  unit: "U/L",       referenceRange: "7 – 56",       defaultValue: "30"   },
    { name: "ALP",                         unit: "U/L",       referenceRange: "44 – 147",     defaultValue: "90"   },
    { name: "Total Protein",               unit: "g/dL",      referenceRange: "6.0 – 8.3",   defaultValue: "7.0"  },
    { name: "Albumin",                     unit: "g/dL",      referenceRange: "3.5 – 5.0",   defaultValue: "4.2"  },
    { name: "Globulin",                    unit: "g/dL",      referenceRange: "2.0 – 3.5",   defaultValue: "2.8"  },
    { name: "A/G Ratio",                   unit: "",          referenceRange: "1.0 – 2.5",   defaultValue: "1.5"  },
  ],
  "RFT": [
    { name: "Blood Urea Nitrogen (BUN)",   unit: "mg/dL",     referenceRange: "7 – 20",       defaultValue: "14"   },
    { name: "Serum Creatinine",            unit: "mg/dL",     referenceRange: "0.6 – 1.2 (M) / 0.5 – 1.1 (F)", defaultValue: "0.9" },
    { name: "Uric Acid",                   unit: "mg/dL",     referenceRange: "3.5 – 7.2 (M) / 2.5 – 6.2 (F)", defaultValue: "5.0" },
    { name: "eGFR",                        unit: "mL/min/1.73m²", referenceRange: "> 60",     defaultValue: "90"   },
    { name: "BUN/Creatinine Ratio",        unit: "",          referenceRange: "10 – 20",      defaultValue: "15"   },
  ],
  "Thyroid Profile (TSH)": [
    { name: "TSH",                         unit: "mIU/L",     referenceRange: "0.4 – 4.0",   defaultValue: "2.0"  },
    { name: "Free T3 (FT3)",               unit: "pg/mL",     referenceRange: "2.3 – 4.2",   defaultValue: "3.2"  },
    { name: "Free T4 (FT4)",               unit: "ng/dL",     referenceRange: "0.8 – 1.8",   defaultValue: "1.3"  },
  ],
  "Serum Electrolytes": [
    { name: "Sodium (Na⁺)",                unit: "mEq/L",     referenceRange: "136 – 145",    defaultValue: "140"  },
    { name: "Potassium (K⁺)",              unit: "mEq/L",     referenceRange: "3.5 – 5.0",   defaultValue: "4.2"  },
    { name: "Chloride (Cl⁻)",             unit: "mEq/L",     referenceRange: "98 – 107",     defaultValue: "102"  },
    { name: "Bicarbonate (HCO₃⁻)",        unit: "mEq/L",     referenceRange: "22 – 29",      defaultValue: "25"   },
  ],
  "PT/INR": [
    { name: "Prothrombin Time (PT)",       unit: "seconds",   referenceRange: "11 – 14",      defaultValue: "12"   },
    { name: "INR",                         unit: "",          referenceRange: "0.8 – 1.2",   defaultValue: "1.0"  },
    { name: "aPTT",                        unit: "seconds",   referenceRange: "25 – 35",      defaultValue: "30"   },
  ],
  "Dengue NS1": [
    { name: "Dengue NS1 Antigen",          unit: "",          referenceRange: "Non-Reactive", defaultValue: "Non-Reactive" },
    { name: "Dengue IgM",                  unit: "",          referenceRange: "Non-Reactive", defaultValue: "Non-Reactive" },
    { name: "Dengue IgG",                  unit: "",          referenceRange: "Non-Reactive", defaultValue: "Non-Reactive" },
  ],
  "Uric Acid": [
    { name: "Serum Uric Acid",             unit: "mg/dL",     referenceRange: "3.5 – 7.2 (M) / 2.5 – 6.2 (F)", defaultValue: "5.0" },
  ],
  "Urine Culture": [
    { name: "Colony Count",                unit: "CFU/mL",    referenceRange: "< 10,000",     defaultValue: "No Growth" },
    { name: "Organism",                    unit: "",          referenceRange: "No Growth",    defaultValue: "No Growth" },
    { name: "Sensitivity",                 unit: "",          referenceRange: "—",            defaultValue: "—"    },
  ],
  "ECG": [
    { name: "Rhythm",                      unit: "",          referenceRange: "Normal Sinus Rhythm", defaultValue: "Normal Sinus Rhythm" },
    { name: "Rate",                        unit: "bpm",       referenceRange: "60 – 100",     defaultValue: "75"   },
    { name: "PR Interval",                 unit: "ms",        referenceRange: "120 – 200",    defaultValue: "160"  },
    { name: "QRS Duration",                unit: "ms",        referenceRange: "< 120",        defaultValue: "90"   },
    { name: "QT/QTc Interval",            unit: "ms",        referenceRange: "< 440",        defaultValue: "400"  },
    { name: "Interpretation",             unit: "",          referenceRange: "—",            defaultValue: "Normal ECG" },
  ],
  "Chest X-Ray": [
    { name: "Lung Fields",                 unit: "",          referenceRange: "Clear",        defaultValue: "Clear" },
    { name: "Heart Size",                  unit: "",          referenceRange: "Normal",       defaultValue: "Normal" },
    { name: "Mediastinum",                 unit: "",          referenceRange: "Normal",       defaultValue: "Normal" },
    { name: "Diaphragm",                   unit: "",          referenceRange: "Normal",       defaultValue: "Normal" },
    { name: "Impression",                  unit: "",          referenceRange: "—",            defaultValue: "Normal CXR" },
  ],
  "USG Abdomen": [
    { name: "Liver",                       unit: "",          referenceRange: "Normal size and echotexture", defaultValue: "Normal" },
    { name: "Gallbladder",                 unit: "",          referenceRange: "Normal",       defaultValue: "Normal" },
    { name: "Spleen",                      unit: "",          referenceRange: "Normal",       defaultValue: "Normal" },
    { name: "Kidneys",                     unit: "",          referenceRange: "Normal bilaterally", defaultValue: "Normal bilaterally" },
    { name: "Pancreas",                    unit: "",          referenceRange: "Normal",       defaultValue: "Normal" },
    { name: "Aorta",                       unit: "",          referenceRange: "Normal",       defaultValue: "Normal" },
    { name: "Free Fluid",                  unit: "",          referenceRange: "None",         defaultValue: "None" },
    { name: "Impression",                  unit: "",          referenceRange: "—",            defaultValue: "No significant abnormality" },
  ],
};

export function getParametersForTest(testName: string): TestParameter[] {
  return LAB_TEST_MASTER[testName] ?? [];
}

export function buildParameterTemplate(tests: string[]): Array<TestParameter & { testName: string; value: string }> {
  const result: Array<TestParameter & { testName: string; value: string }> = [];
  for (const test of tests) {
    const params = getParametersForTest(test);
    for (const p of params) {
      result.push({ ...p, testName: test, value: "" });
    }
  }
  return result;
}
