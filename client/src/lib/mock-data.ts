// ─── Patients ────────────────────────────────────────────────────────────────
export const PATIENTS = [
  { id: "UHID-001", name: "Arjun Mehta",       age: 45, gender: "M", bloodGroup: "O+", phone: "9876543210", address: "Chennai", department: "Cardiology",   status: "OPD",      admittedOn: "2026-05-06", doctor: "Dr. Priya Rajan",    diagnosis: "Hypertension", insurance: "Star Health", riskLevel: "High" },
  { id: "UHID-002", name: "Lakshmi Devi",      age: 62, gender: "F", bloodGroup: "B+", phone: "9876543211", address: "Coimbatore", department: "Orthopedics",  status: "IPD",      admittedOn: "2026-05-04", doctor: "Dr. Karthik Nair",   diagnosis: "Hip Fracture", insurance: "New India", riskLevel: "Medium" },
  { id: "UHID-003", name: "Vikram Singh",      age: 34, gender: "M", bloodGroup: "A+", phone: "9876543212", address: "Madurai",   department: "Neurology",    status: "OPD",      admittedOn: "2026-05-07", doctor: "Dr. Anitha Kumar",   diagnosis: "Migraine", insurance: "None", riskLevel: "Low" },
  { id: "UHID-004", name: "Preethi Raj",       age: 28, gender: "F", bloodGroup: "AB+",phone: "9876543213", address: "Salem",     department: "Obstetrics",   status: "IPD",      admittedOn: "2026-05-05", doctor: "Dr. Meena Suresh",   diagnosis: "Pregnancy - 36wks", insurance: "Medi Assist", riskLevel: "Low" },
  { id: "UHID-005", name: "Suresh Kumar",      age: 55, gender: "M", bloodGroup: "O-", phone: "9876543214", address: "Trichy",    department: "Nephrology",   status: "ICU",      admittedOn: "2026-05-03", doctor: "Dr. Rajesh Mohan",   diagnosis: "CKD Stage 4", insurance: "TPA Corp", riskLevel: "Critical" },
  { id: "UHID-006", name: "Deepa Nair",        age: 41, gender: "F", bloodGroup: "B-", phone: "9876543215", address: "Chennai",   department: "Oncology",     status: "OPD",      admittedOn: "2026-05-07", doctor: "Dr. Sundar Ram",     diagnosis: "Breast Cancer Follow-up", insurance: "Star Health", riskLevel: "High" },
  { id: "UHID-007", name: "Ramesh Babu",       age: 67, gender: "M", bloodGroup: "A-", phone: "9876543216", address: "Vellore",   department: "Cardiology",   status: "IPD",      admittedOn: "2026-05-02", doctor: "Dr. Priya Rajan",    diagnosis: "STEMI Post-Angioplasty", insurance: "New India", riskLevel: "High" },
  { id: "UHID-008", name: "Kavitha Murugan",   age: 22, gender: "F", bloodGroup: "O+", phone: "9876543217", address: "Erode",     department: "Emergency",    status: "Discharged", admittedOn: "2026-05-01", doctor: "Dr. Arun Selvam",  diagnosis: "Appendicitis - Post-op", insurance: "None", riskLevel: "Low" },
];

// ─── Appointments ─────────────────────────────────────────────────────────────
export const APPOINTMENTS = [
  { id: "APT-001", patientId: "UHID-001", patientName: "Arjun Mehta",     doctor: "Dr. Priya Rajan",   department: "Cardiology",   date: "2026-05-08", time: "09:00 AM", type: "Follow-up",   status: "Confirmed",  token: "C-01" },
  { id: "APT-002", patientId: "UHID-003", patientName: "Vikram Singh",    doctor: "Dr. Anitha Kumar",  department: "Neurology",    date: "2026-05-08", time: "09:30 AM", type: "New",         status: "Waiting",    token: "N-01" },
  { id: "APT-003", patientId: "UHID-006", patientName: "Deepa Nair",      doctor: "Dr. Sundar Ram",    department: "Oncology",     date: "2026-05-08", time: "10:00 AM", type: "Follow-up",   status: "In Consult", token: "O-01" },
  { id: "APT-004", patientId: "UHID-009", patientName: "Geetha Krishnan", doctor: "Dr. Meena Suresh",  department: "Obstetrics",   date: "2026-05-08", time: "10:30 AM", type: "New",         status: "Confirmed",  token: "OB-01" },
  { id: "APT-005", patientId: "UHID-010", patientName: "Murugan Das",     doctor: "Dr. Karthik Nair",  department: "Orthopedics",  date: "2026-05-08", time: "11:00 AM", type: "Follow-up",   status: "Confirmed",  token: "OR-01" },
  { id: "APT-006", patientId: "UHID-011", patientName: "Selvi Rajan",     doctor: "Dr. Rajesh Mohan",  department: "Nephrology",   date: "2026-05-08", time: "11:30 AM", type: "Teleconsult", status: "Scheduled",  token: "NP-01" },
  { id: "APT-007", patientId: "UHID-012", patientName: "Bala Sundaram",   doctor: "Dr. Arun Selvam",   department: "Emergency",    date: "2026-05-08", time: "12:00 PM", type: "Emergency",   status: "In Consult", token: "ER-01" },
  { id: "APT-008", patientId: "UHID-013", patientName: "Parvathi Iyer",   doctor: "Dr. Priya Rajan",   department: "Cardiology",   date: "2026-05-08", time: "02:00 PM", type: "New",         status: "Scheduled",  token: "C-02" },
];

// ─── Beds ────────────────────────────────────────────────────────────────────
export const BED_OCCUPANCY = [
  { ward: "General", total: 80, occupied: 68, available: 12 },
  { ward: "Semi-Private", total: 40, occupied: 35, available: 5 },
  { ward: "Private", total: 30, occupied: 22, available: 8 },
  { ward: "ICU", total: 20, occupied: 17, available: 3 },
  { ward: "NICU", total: 10, occupied: 6, available: 4 },
  { ward: "Isolation", total: 8, occupied: 3, available: 5 },
];

// ─── Lab Orders ──────────────────────────────────────────────────────────────
export const LAB_ORDERS = [
  { id: "LAB-001", patientId: "UHID-001", patientName: "Arjun Mehta",   test: "Lipid Profile",        ordered: "2026-05-08 08:30", status: "Completed",   result: "LDL 142 mg/dL (High)", priority: "Routine", doctor: "Dr. Priya Rajan" },
  { id: "LAB-002", patientId: "UHID-005", patientName: "Suresh Kumar",  test: "Renal Function Tests", ordered: "2026-05-08 07:00", status: "Processing",  result: null, priority: "STAT", doctor: "Dr. Rajesh Mohan" },
  { id: "LAB-003", patientId: "UHID-002", patientName: "Lakshmi Devi",  test: "Complete Blood Count",  ordered: "2026-05-08 09:00", status: "Collected",   result: null, priority: "Routine", doctor: "Dr. Karthik Nair" },
  { id: "LAB-004", patientId: "UHID-007", patientName: "Ramesh Babu",   test: "Cardiac Troponin",      ordered: "2026-05-08 06:00", status: "Completed",   result: "Troponin I 0.04 ng/mL (Normal)", priority: "STAT", doctor: "Dr. Priya Rajan" },
  { id: "LAB-005", patientId: "UHID-004", patientName: "Preethi Raj",   test: "HbA1c",                 ordered: "2026-05-08 10:00", status: "Pending",     result: null, priority: "Routine", doctor: "Dr. Meena Suresh" },
  { id: "LAB-006", patientId: "UHID-003", patientName: "Vikram Singh",  test: "MRI Brain",             ordered: "2026-05-08 09:30", status: "Scheduled",   result: null, priority: "Routine", doctor: "Dr. Anitha Kumar" },
];

// ─── Pharmacy Orders ──────────────────────────────────────────────────────────
export const PHARMACY_ORDERS = [
  { id: "RX-001", patientId: "UHID-001", patientName: "Arjun Mehta",   drug: "Amlodipine 5mg",       qty: 30, unit: "Tabs", status: "Dispensed", type: "OPD",  doctor: "Dr. Priya Rajan",  time: "09:45 AM" },
  { id: "RX-002", patientId: "UHID-002", patientName: "Lakshmi Devi",  drug: "Tramadol 50mg Inj",    qty: 5,  unit: "Vials",status: "Pending",   type: "IPD",  doctor: "Dr. Karthik Nair", time: "10:00 AM" },
  { id: "RX-003", patientId: "UHID-005", patientName: "Suresh Kumar",  drug: "Furosemide 40mg",      qty: 10, unit: "Tabs", status: "Dispensed", type: "ICU",  doctor: "Dr. Rajesh Mohan", time: "07:30 AM" },
  { id: "RX-004", patientId: "UHID-007", patientName: "Ramesh Babu",   drug: "Aspirin 75mg",         qty: 30, unit: "Tabs", status: "Verified",  type: "IPD",  doctor: "Dr. Priya Rajan",  time: "08:00 AM" },
  { id: "RX-005", patientId: "UHID-004", patientName: "Preethi Raj",   drug: "Ferrous Sulphate",     qty: 60, unit: "Tabs", status: "Pending",   type: "OPD",  doctor: "Dr. Meena Suresh", time: "10:30 AM" },
];

// ─── Drug Inventory ──────────────────────────────────────────────────────────
export const DRUG_INVENTORY = [
  { name: "Paracetamol 500mg", stock: 2400, unit: "Tabs", reorderLevel: 500, expiryDate: "2027-06-30", status: "OK", supplier: "Sun Pharma" },
  { name: "Amlodipine 5mg", stock: 340, unit: "Tabs", reorderLevel: 500, expiryDate: "2026-12-31", status: "Low", supplier: "Cipla" },
  { name: "Insulin Glargine", stock: 45, unit: "Vials", reorderLevel: 50, expiryDate: "2026-08-15", status: "Critical", supplier: "Sanofi" },
  { name: "Ceftriaxone 1g Inj", stock: 120, unit: "Vials", reorderLevel: 100, expiryDate: "2026-10-20", status: "OK", supplier: "Dr. Reddy's" },
  { name: "Furosemide 40mg", stock: 800, unit: "Tabs", reorderLevel: 200, expiryDate: "2027-03-31", status: "OK", supplier: "Cipla" },
  { name: "Metformin 500mg", stock: 90, unit: "Tabs", reorderLevel: 300, expiryDate: "2027-01-15", status: "Low", supplier: "Lupin" },
];

// ─── Billing Records ──────────────────────────────────────────────────────────
export const BILLING_RECORDS = [
  { id: "BILL-001", patientId: "UHID-008", patientName: "Kavitha Murugan", date: "2026-05-07", amount: 42500, paid: 42500, balance: 0,     status: "Paid",    payer: "Cash",        type: "IPD Final" },
  { id: "BILL-002", patientId: "UHID-001", patientName: "Arjun Mehta",     date: "2026-05-07", amount: 1800,  paid: 1800,  balance: 0,     status: "Paid",    payer: "Star Health", type: "OPD" },
  { id: "BILL-003", patientId: "UHID-002", patientName: "Lakshmi Devi",    date: "2026-05-06", amount: 85000, paid: 40000, balance: 45000, status: "Partial", payer: "New India",   type: "IPD Advance" },
  { id: "BILL-004", patientId: "UHID-005", patientName: "Suresh Kumar",    date: "2026-05-05", amount: 28000, paid: 0,     balance: 28000, status: "Pending", payer: "TPA Corp",    type: "ICU Daily" },
  { id: "BILL-005", patientId: "UHID-007", patientName: "Ramesh Babu",     date: "2026-05-04", amount: 95000, paid: 95000, balance: 0,     status: "Claimed", payer: "New India",   type: "OT Package" },
];

// ─── Dashboard KPIs ───────────────────────────────────────────────────────────
export const HOSPITAL_METRICS = {
  totalPatients: 1248,
  opdToday: 87,
  ipdCurrent: 148,
  icuCurrent: 17,
  bedOccupancyRate: 76,
  avgLOS: 4.2,
  revenueToday: 284000,
  revenueMonth: 6820000,
  pendingClaims: 42,
  appointmentsToday: 124,
  surgeriesThisWeek: 18,
  criticalAlerts: 3,
};

// ─── Revenue Trend ───────────────────────────────────────────────────────────
export const REVENUE_TREND = [
  { month: "Nov", opd: 320000, ipd: 1800000, pharmacy: 420000 },
  { month: "Dec", opd: 290000, ipd: 2100000, pharmacy: 390000 },
  { month: "Jan", opd: 410000, ipd: 2400000, pharmacy: 510000 },
  { month: "Feb", opd: 380000, ipd: 2200000, pharmacy: 480000 },
  { month: "Mar", opd: 450000, ipd: 2600000, pharmacy: 540000 },
  { month: "Apr", opd: 420000, ipd: 2500000, pharmacy: 520000 },
  { month: "May", opd: 284000, ipd: 1800000, pharmacy: 380000 },
];

// ─── Department Volume ────────────────────────────────────────────────────────
export const DEPT_VOLUME = [
  { name: "Cardiology",   patients: 24 },
  { name: "Orthopedics",  patients: 18 },
  { name: "Obstetrics",   patients: 15 },
  { name: "Neurology",    patients: 12 },
  { name: "Oncology",     patients: 9  },
  { name: "Nephrology",   patients: 9  },
];

// ─── Staff / Doctors ──────────────────────────────────────────────────────────
export const DOCTORS = [
  { id: "DOC-001", name: "Dr. Priya Rajan",  specialty: "Cardiology",  qualification: "MD, DM (Cardiology)", experience: 14, status: "On Duty", patients: 12, rating: 4.8 },
  { id: "DOC-002", name: "Dr. Karthik Nair", specialty: "Orthopedics", qualification: "MS (Ortho)",          experience: 10, status: "On Duty", patients: 9, rating: 4.7 },
  { id: "DOC-003", name: "Dr. Anitha Kumar", specialty: "Neurology",   qualification: "MD, DM (Neuro)",      experience: 12, status: "Off Duty",patients: 0, rating: 4.9 },
  { id: "DOC-004", name: "Dr. Meena Suresh", specialty: "Obstetrics",  qualification: "MS (OBG)",            experience: 8,  status: "On Duty", patients: 7, rating: 4.6 },
  { id: "DOC-005", name: "Dr. Rajesh Mohan", specialty: "Nephrology",  qualification: "MD, DM (Nephro)",     experience: 16, status: "On Duty", patients: 6, rating: 4.8 },
  { id: "DOC-006", name: "Dr. Sundar Ram",   specialty: "Oncology",    qualification: "MD (Onco)",           experience: 11, status: "On Duty", patients: 5, rating: 4.7 },
  { id: "DOC-007", name: "Dr. Arun Selvam",  specialty: "Emergency",   qualification: "MD (Emergency)",      experience: 7,  status: "On Duty", patients: 15, rating: 4.5 },
];

// ─── AI Alerts ────────────────────────────────────────────────────────────────
export const AI_ALERTS = [
  { id: 1, type: "critical", module: "ICU",      patient: "Suresh Kumar (UHID-005)", message: "Sepsis Early Warning: qSOFA score 3 — elevated lactate trend detected", time: "08:45 AM", action: "Review Now" },
  { id: 2, type: "warning",  module: "Pharmacy", patient: null,                      message: "Stock-out alert: Insulin Glargine below critical threshold (45 vials)", time: "09:00 AM", action: "Order Now" },
  { id: 3, type: "info",     module: "Billing",  patient: "Lakshmi Devi (UHID-002)", message: "Insurance claim BILL-003 pre-authorization pending for 48+ hrs",       time: "09:15 AM", action: "Follow Up" },
  { id: 4, type: "warning",  module: "IPD",      patient: "Ramesh Babu (UHID-007)", message: "Discharge Readiness AI: Patient clinically stable — discharge eligible", time: "09:30 AM", action: "Review" },
];
