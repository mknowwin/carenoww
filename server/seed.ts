import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import Tenant from "./models/Tenant.js";
import User from "./models/User.js";
import Patient from "./models/Patient.js";
import Appointment from "./models/Appointment.js";
import LabOrder from "./models/LabOrder.js";
import PharmacyOrder from "./models/PharmacyOrder.js";
import DrugInventory from "./models/DrugInventory.js";
import BillingRecord from "./models/BillingRecord.js";
import BedOccupancy from "./models/BedOccupancy.js";
import { connectDB } from "./db.js";

export async function seedTenant(tenantId: string) {
  const tid = new mongoose.Types.ObjectId(tenantId);

  // Clear existing data for this tenant
  await Promise.all([
    Patient.deleteMany({ tenantId: tid }),
    Appointment.deleteMany({ tenantId: tid }),
    LabOrder.deleteMany({ tenantId: tid }),
    PharmacyOrder.deleteMany({ tenantId: tid }),
    DrugInventory.deleteMany({ tenantId: tid }),
    BillingRecord.deleteMany({ tenantId: tid }),
    BedOccupancy.deleteMany({ tenantId: tid }),
  ]);

  // Seed Patients
  await Patient.insertMany([
    { tenantId: tid, uhid: "UHID-001", name: "Arjun Mehta",     age: 45, gender: "M", bloodGroup: "O+", phone: "9876543210", address: "Chennai",     department: "Cardiology",  status: "OPD",       admittedOn: new Date("2026-05-06"), doctor: "Dr. Priya Rajan",  diagnosis: "Hypertension",            insurance: "Star Health", riskLevel: "High" },
    { tenantId: tid, uhid: "UHID-002", name: "Lakshmi Devi",    age: 62, gender: "F", bloodGroup: "B+", phone: "9876543211", address: "Coimbatore",  department: "Orthopedics", status: "IPD",       admittedOn: new Date("2026-05-04"), doctor: "Dr. Karthik Nair", diagnosis: "Hip Fracture",             insurance: "New India",   riskLevel: "Medium" },
    { tenantId: tid, uhid: "UHID-003", name: "Vikram Singh",    age: 34, gender: "M", bloodGroup: "A+", phone: "9876543212", address: "Madurai",     department: "Neurology",   status: "OPD",       admittedOn: new Date("2026-05-07"), doctor: "Dr. Anitha Kumar", diagnosis: "Migraine",                insurance: "None",        riskLevel: "Low" },
    { tenantId: tid, uhid: "UHID-004", name: "Preethi Raj",     age: 28, gender: "F", bloodGroup: "AB+",phone: "9876543213", address: "Salem",       department: "Obstetrics",  status: "IPD",       admittedOn: new Date("2026-05-05"), doctor: "Dr. Meena Suresh", diagnosis: "Pregnancy - 36wks",        insurance: "Medi Assist", riskLevel: "Low" },
    { tenantId: tid, uhid: "UHID-005", name: "Suresh Kumar",    age: 55, gender: "M", bloodGroup: "O-", phone: "9876543214", address: "Trichy",      department: "Nephrology",  status: "ICU",       admittedOn: new Date("2026-05-03"), doctor: "Dr. Rajesh Mohan", diagnosis: "CKD Stage 4",              insurance: "TPA Corp",    riskLevel: "Critical" },
    { tenantId: tid, uhid: "UHID-006", name: "Deepa Nair",      age: 41, gender: "F", bloodGroup: "B-", phone: "9876543215", address: "Chennai",     department: "Oncology",    status: "OPD",       admittedOn: new Date("2026-05-07"), doctor: "Dr. Sundar Ram",   diagnosis: "Breast Cancer Follow-up", insurance: "Star Health", riskLevel: "High" },
    { tenantId: tid, uhid: "UHID-007", name: "Ramesh Babu",     age: 67, gender: "M", bloodGroup: "A-", phone: "9876543216", address: "Vellore",     department: "Cardiology",  status: "IPD",       admittedOn: new Date("2026-05-02"), doctor: "Dr. Priya Rajan",  diagnosis: "STEMI Post-Angioplasty",  insurance: "New India",   riskLevel: "High" },
    { tenantId: tid, uhid: "UHID-008", name: "Kavitha Murugan", age: 22, gender: "F", bloodGroup: "O+", phone: "9876543217", address: "Erode",       department: "Emergency",   status: "Discharged",admittedOn: new Date("2026-05-01"), doctor: "Dr. Arun Selvam",  diagnosis: "Appendicitis - Post-op",  insurance: "None",        riskLevel: "Low" },
  ]);

  // Seed Appointments
  await Appointment.insertMany([
    { tenantId: tid, aptId: "APT-001", patientId: "UHID-001", patientName: "Arjun Mehta",     doctor: "Dr. Priya Rajan",  department: "Cardiology",  date: "2026-05-08", time: "09:00 AM", type: "Follow-up",   status: "Confirmed",  token: "C-01" },
    { tenantId: tid, aptId: "APT-002", patientId: "UHID-003", patientName: "Vikram Singh",    doctor: "Dr. Anitha Kumar", department: "Neurology",   date: "2026-05-08", time: "09:30 AM", type: "New",         status: "Waiting",    token: "N-01" },
    { tenantId: tid, aptId: "APT-003", patientId: "UHID-006", patientName: "Deepa Nair",      doctor: "Dr. Sundar Ram",   department: "Oncology",    date: "2026-05-08", time: "10:00 AM", type: "Follow-up",   status: "In Consult", token: "O-01" },
    { tenantId: tid, aptId: "APT-004", patientId: "UHID-004", patientName: "Preethi Raj",     doctor: "Dr. Meena Suresh", department: "Obstetrics",  date: "2026-05-08", time: "10:30 AM", type: "New",         status: "Confirmed",  token: "OB-01" },
    { tenantId: tid, aptId: "APT-005", patientId: "UHID-002", patientName: "Lakshmi Devi",    doctor: "Dr. Karthik Nair", department: "Orthopedics", date: "2026-05-08", time: "11:00 AM", type: "Follow-up",   status: "Confirmed",  token: "OR-01" },
    { tenantId: tid, aptId: "APT-006", patientId: "UHID-005", patientName: "Suresh Kumar",    doctor: "Dr. Rajesh Mohan", department: "Nephrology",  date: "2026-05-08", time: "11:30 AM", type: "Teleconsult", status: "Scheduled",  token: "NP-01" },
    { tenantId: tid, aptId: "APT-007", patientId: "UHID-007", patientName: "Ramesh Babu",     doctor: "Dr. Priya Rajan",  department: "Cardiology",  date: "2026-05-08", time: "02:00 PM", type: "New",         status: "Scheduled",  token: "C-02" },
  ]);

  // Seed Lab Orders
  await LabOrder.insertMany([
    { tenantId: tid, labId: "LAB-001", patientId: "UHID-001", patientName: "Arjun Mehta",  test: "Lipid Profile",        ordered: new Date(), status: "Completed",  result: "LDL 142 mg/dL (High)",                  priority: "Routine", doctor: "Dr. Priya Rajan"  },
    { tenantId: tid, labId: "LAB-002", patientId: "UHID-005", patientName: "Suresh Kumar", test: "Renal Function Tests",  ordered: new Date(), status: "Processing", result: null,                                    priority: "STAT",    doctor: "Dr. Rajesh Mohan" },
    { tenantId: tid, labId: "LAB-003", patientId: "UHID-002", patientName: "Lakshmi Devi", test: "Complete Blood Count",  ordered: new Date(), status: "Collected",  result: null,                                    priority: "Routine", doctor: "Dr. Karthik Nair" },
    { tenantId: tid, labId: "LAB-004", patientId: "UHID-007", patientName: "Ramesh Babu",  test: "Cardiac Troponin",      ordered: new Date(), status: "Completed",  result: "Troponin I 0.04 ng/mL (Normal)",        priority: "STAT",    doctor: "Dr. Priya Rajan"  },
    { tenantId: tid, labId: "LAB-005", patientId: "UHID-004", patientName: "Preethi Raj",  test: "HbA1c",                 ordered: new Date(), status: "Pending",    result: null,                                    priority: "Routine", doctor: "Dr. Meena Suresh" },
    { tenantId: tid, labId: "LAB-006", patientId: "UHID-003", patientName: "Vikram Singh", test: "MRI Brain",             ordered: new Date(), status: "Scheduled",  result: null,                                    priority: "Routine", doctor: "Dr. Anitha Kumar" },
  ]);

  // Seed Pharmacy Orders
  await PharmacyOrder.insertMany([
    { tenantId: tid, rxId: "RX-001", patientId: "UHID-001", patientName: "Arjun Mehta",  drug: "Amlodipine 5mg",    qty: 30, unit: "Tabs",  status: "Dispensed", type: "OPD", doctor: "Dr. Priya Rajan",  time: "09:45 AM" },
    { tenantId: tid, rxId: "RX-002", patientId: "UHID-002", patientName: "Lakshmi Devi", drug: "Tramadol 50mg Inj", qty: 5,  unit: "Vials", status: "Pending",   type: "IPD", doctor: "Dr. Karthik Nair", time: "10:00 AM" },
    { tenantId: tid, rxId: "RX-003", patientId: "UHID-005", patientName: "Suresh Kumar", drug: "Furosemide 40mg",   qty: 10, unit: "Tabs",  status: "Dispensed", type: "ICU", doctor: "Dr. Rajesh Mohan", time: "07:30 AM" },
    { tenantId: tid, rxId: "RX-004", patientId: "UHID-007", patientName: "Ramesh Babu",  drug: "Aspirin 75mg",      qty: 30, unit: "Tabs",  status: "Verified",  type: "IPD", doctor: "Dr. Priya Rajan",  time: "08:00 AM" },
    { tenantId: tid, rxId: "RX-005", patientId: "UHID-004", patientName: "Preethi Raj",  drug: "Ferrous Sulphate",  qty: 60, unit: "Tabs",  status: "Pending",   type: "OPD", doctor: "Dr. Meena Suresh", time: "10:30 AM" },
  ]);

  // Seed Drug Inventory
  await DrugInventory.insertMany([
    { tenantId: tid, name: "Paracetamol 500mg", stock: 2400, unit: "Tabs",  reorderLevel: 500, expiryDate: new Date("2027-06-30"), status: "OK",       supplier: "Sun Pharma"  },
    { tenantId: tid, name: "Amlodipine 5mg",    stock: 340,  unit: "Tabs",  reorderLevel: 500, expiryDate: new Date("2026-12-31"), status: "Low",      supplier: "Cipla"       },
    { tenantId: tid, name: "Insulin Glargine",  stock: 45,   unit: "Vials", reorderLevel: 50,  expiryDate: new Date("2026-08-15"), status: "Critical", supplier: "Sanofi"      },
    { tenantId: tid, name: "Ceftriaxone 1g Inj",stock: 120,  unit: "Vials", reorderLevel: 100, expiryDate: new Date("2026-10-20"), status: "OK",       supplier: "Dr. Reddy's" },
    { tenantId: tid, name: "Furosemide 40mg",   stock: 800,  unit: "Tabs",  reorderLevel: 200, expiryDate: new Date("2027-03-31"), status: "OK",       supplier: "Cipla"       },
    { tenantId: tid, name: "Metformin 500mg",   stock: 90,   unit: "Tabs",  reorderLevel: 300, expiryDate: new Date("2027-01-15"), status: "Low",      supplier: "Lupin"       },
  ]);

  // Seed Billing
  await BillingRecord.insertMany([
    { tenantId: tid, billId: "BILL-001", patientId: "UHID-008", patientName: "Kavitha Murugan", date: new Date("2026-05-07"), amount: 42500, paid: 42500, balance: 0,     status: "Paid",    payer: "Cash",        type: "IPD"   },
    { tenantId: tid, billId: "BILL-002", patientId: "UHID-001", patientName: "Arjun Mehta",     date: new Date("2026-05-07"), amount: 1800,  paid: 1800,  balance: 0,     status: "Paid",    payer: "Star Health", type: "OPD"         },
    { tenantId: tid, billId: "BILL-003", patientId: "UHID-002", patientName: "Lakshmi Devi",    date: new Date("2026-05-06"), amount: 85000, paid: 40000, balance: 45000, status: "Partial", payer: "New India",   type: "IPD" },
    { tenantId: tid, billId: "BILL-004", patientId: "UHID-005", patientName: "Suresh Kumar",    date: new Date("2026-05-05"), amount: 28000, paid: 0,     balance: 28000, status: "Pending", payer: "TPA Corp",    type: "IPD"   },
    { tenantId: tid, billId: "BILL-005", patientId: "UHID-007", patientName: "Ramesh Babu",     date: new Date("2026-05-04"), amount: 95000, paid: 95000, balance: 0,     status: "Claimed", payer: "New India",   type: "IPD"  },
  ]);

  // Seed Bed Occupancy
  await BedOccupancy.insertMany([
    { tenantId: tid, ward: "General",     total: 80, occupied: 68, available: 12 },
    { tenantId: tid, ward: "Semi-Private",total: 40, occupied: 35, available: 5  },
    { tenantId: tid, ward: "Private",     total: 30, occupied: 22, available: 8  },
    { tenantId: tid, ward: "ICU",         total: 20, occupied: 17, available: 3  },
    { tenantId: tid, ward: "NICU",        total: 10, occupied: 6,  available: 4  },
    { tenantId: tid, ward: "Isolation",   total: 8,  occupied: 3,  available: 5  },
  ]);

  console.log(`✅ Seed complete for tenant: ${tenantId}`);
}

export async function seedUsers(tenantId: string) {
  const tid = new mongoose.Types.ObjectId(tenantId);
  const roles = [
    { name: "Dr. Priya Rajan",   email: "doctor@demo.com",     role: "doctor",       department: "Cardiology",    password: "doctor123"  },
    { name: "Sr. Meena Thomas",  email: "nurse@demo.com",      role: "nurse",        department: "ICU",           password: "nurse123"   },
    { name: "Arun Selvakumar",   email: "reception@demo.com",  role: "receptionist", department: "Front Desk",    password: "front123"   },
    { name: "Kavitha Pharma",    email: "pharmacy@demo.com",   role: "pharmacist",   department: "Pharmacy",      password: "pharma123"  },
    { name: "Ravi Lab Tech",     email: "lab@demo.com",        role: "lab_tech",     department: "Laboratory",    password: "lab123"     },
    { name: "Sunita Finance",    email: "finance@demo.com",    role: "finance",      department: "Finance",       password: "finance123" },
  ];

  for (const u of roles) {
    const exists = await User.findOne({ tenantId: tid, email: u.email });
    if (!exists) {
      await User.create({ tenantId: tid, ...u, passwordHash: await bcrypt.hash(u.password, 10), isActive: true });
    }
  }
}

// Run as standalone script: npx tsx server/seed.ts
if (process.argv[1]?.includes("seed")) {
  (async () => {
    await connectDB();
    // Create a demo tenant if none exists
    let tenant = await Tenant.findOne({ slug: "demo-hospital" });
    if (!tenant) {
      tenant = await Tenant.create({
        name: "Carenoww Demo Hospital",
        slug: "demo-hospital",
        plan: "professional",
        status: "active",
        contact: { email: "admin@demo.com", phone: "9999999999", address: "123 Main St", city: "Chennai", state: "Tamil Nadu", country: "India" },
        settings: { maxUsers: 50, maxPatients: 5000, modules: ["dashboard","patients","appointments","opd","ipd","lab","pharmacy","billing","analytics"] },
      });

      // Create admin user
      const passwordHash = await bcrypt.hash("admin123", 10);
      await User.create({
        tenantId: tenant._id,
        name: "Dr. Admin Kumar",
        email: "admin@demo.com",
        passwordHash,
        role: "admin",
        department: "Administration",
        isActive: true,
      });
      console.log("✅ Demo tenant created: admin@demo.com / admin123");
    }

    await seedTenant(tenant._id.toString());
    await seedUsers(tenant._id.toString());
    console.log("✅ Seed complete!");
    process.exit(0);
  })();
}
