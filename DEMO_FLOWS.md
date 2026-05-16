# Carenoww HMS — Demo Flows

> App: http://localhost:3200 · API: http://localhost:3201

---

## Credentials (Greenfield Clinic)

| Role          | Email                          | Password      |
|---------------|-------------------------------|---------------|
| Superadmin    | superadmin@carenoww.io         | SuperAdmin@2026! |
| Admin         | admin@greenfield.clinic        | Admin@1234    |
| Doctor        | priya@greenfield.clinic        | Doctor@1234   |
| Receptionist  | reception@greenfield.clinic    | Recept@1234   |
| Nurse         | nurse@greenfield.clinic        | Nurse@1234    |
| Lab Tech      | lab@greenfield.clinic          | Lab@1234      |
| Pharmacist    | pharmacy@greenfield.clinic     | Pharma@1234   |

---

## Flow 1 — OPD Outpatient (Walk-in to Consultation Complete)

### Step 1: Admin/Receptionist — Book Appointment
1. Login as **admin** → go to **Appointments**
2. Click **"Book Appointment"**
3. Search patient by name/UHID → select
4. Select **Department** (e.g., General Medicine) → doctor cards load showing availability
5. Select **doctor** → slot grid loads (15-min slots, booked slots greyed out)
6. Click a slot → token preview shows (e.g., GM-003)
7. Submit → appointment created, token auto-generated

### Step 2: Receptionist — Check In
1. Login as **reception** → go to **Reception** (`/reception`)
2. See appointment list with status "Confirmed"
3. Click **"Check In"** → status changes to "Waiting"
4. Green banner pops up showing token number (e.g., GM-003)
5. Click **"Print Slip"** → browser print dialog opens with token slip

### Step 3: Doctor — View Queue & Call Patient
1. Login as **doctor** → go to **My Queue** (`/doctor-queue`)
2. See patient in "Waiting" list with token
3. Click **"Call In"** → patient moves to "In Consult" (Now In Room card)
4. Patient details panel shows: age, blood group, risk, diagnosis, past visits

### Step 4: Doctor — OPD Consultation (EMR)
1. Go to **OPD** page
2. Select patient from queue (left panel)
3. **Consultation tab**:
   - Enter vitals: BP, Pulse, Temp, SpO₂, Weight, Height (BMI auto-calculates)
   - Fill SOAP notes (Subjective / Objective / Assessment / Plan)
   - Click **"Order Lab Test"** → LabOrderModal opens → select CBC, CRP etc → Order
   - Click **"Write Prescription"** → PrescriptionModal → add drugs with dose/frequency/duration → "Save & Send to Pharmacy"
   - Click **"Admit to Ward"** → AdmitModal (for IPD cases)
   - Click **"Complete & Sign Note"** → saves vitals+SOAP, status → Completed
4. **History tab**: shows all past OPD visits for this patient
5. **Reports & Files tab**: upload physical lab reports/scans (PDF, image) with notes

### Step 5: Lab — Enter Result
1. Login as **lab** → go to **Lab** page
2. See pending lab orders
3. Click **"Mark Collected"** → **"Start Processing"** → enter result in text area → **"Save & Complete"**

### Step 6: Pharmacy — Dispense
1. Login as **pharmacy** → go to **Pharmacy** page
2. **Prescriptions tab**: see auto-created order from doctor's prescription
3. Click **"Verify"** → **"Dispense"** → marked dispensed with your name + timestamp

### Step 7: Billing — Generate Invoice
1. Login as **admin/receptionist** → go to **Billing**
2. Click **"Generate Bill"**
3. Add line items: Consultation fee, Lab charges, Pharmacy charges (each with category)
4. Set paid amount + payment mode → submit
5. Bill shows with line-item breakdown; click **"▼ Items"** to expand

---

## Flow 2 — IPD Inpatient (Admit to Discharge)

### Step 1: Admit from OPD
1. Doctor in OPD → click **"Admit to Ward"** in Orders panel
2. AdmitModal opens → select ward (ICU/General/Private), bed number, department, confirming doctor
3. Enter provisional diagnosis → click **"Admit Patient"**
4. Patient status changes to IPD

### Step 2: IPD Dashboard
1. Login as **admin/nurse** → go to **IPD** page
2. **Patient List tab**: see all active admissions with ward, bed, day count, diagnosis
3. **Bed Map tab**: visual grid of occupied beds per ward

### Step 3: Nursing Rounds
1. On any admission card → click **"Add Round"**
2. Enter: BP, Pulse, Temp, SpO₂, Weight + round notes
3. Click **"Save Round"** → appears in rounds history (click **"Rounds"** to expand)
4. Auto-updated every 30s

### Step 4: Inpatient Prescriptions
1. From IPD or OPD → write prescription with type=IPD
2. Pharmacy sees order, verifies, dispenses

### Step 5: Discharge
1. On admission card → click **"Discharge"**
2. DischargeModal: final diagnosis, treatment summary, discharge medications, follow-up instructions, patient condition
3. Click **"Confirm Discharge"** → admission status=Discharged, patient status=Discharged
4. Appears in "Recent Discharges" panel on right

---

## Flow 3 — Token Display Screen (TV/Kiosk)

1. Admin → **Settings → Hospital** tab
2. Find **"Token Display Screen"** section
3. Copy the URL (format: `http://localhost:3200/display?tid=<tenantId>`)
4. Open on any browser/TV
5. Screen auto-refreshes every 10s showing:
   - **Now Serving**: large token numbers for patients "In Consult"
   - **Waiting**: count per doctor
   - No login required

---

## Flow 4 — Superadmin — Multi-tenant Management

1. Go to `http://localhost:3200/superadmin`
2. Login: superadmin@carenoww.io / SuperAdmin@2026!
3. **Create Tenant**: name, slug, plan, admin email/password
4. **Activate Tenant**: set status=active
5. **Seed Data**: auto-populate sample patients/appointments for demos
6. View all tenants, their user counts, patient counts, plan status

---

## Module Summary — What's Built

| Module              | Done | Notes |
|---------------------|------|-------|
| Multi-tenant SaaS   | ✅   | All data scoped by tenantId |
| User roles (7 types)| ✅   | JWT + role-based middleware |
| Patient Registry    | ✅   | UHID auto-gen, search, full profile |
| Appointment Booking | ✅   | Dept→Doctor→Slot→Token flow |
| Token Generation    | ✅   | GM-001, C-001, ER-001 per dept |
| Reception Check-in  | ✅   | Token slip + print button |
| Doctor Queue        | ✅   | Real-time In Consult / Waiting |
| OPD/EMR             | ✅   | Vitals, SOAP, History, Reports |
| Prescription        | ✅   | Structured drug form → auto pharmacy order |
| Lab Orders          | ✅   | Order from OPD → lab queue → result entry |
| IPD Admission       | ✅   | Admit from OPD, ward/bed assign |
| Nursing Rounds      | ✅   | Daily vitals charting per admission |
| Discharge Summary   | ✅   | Full discharge form + condition |
| Bed Map             | ✅   | Visual ward/bed occupancy |
| Pharmacy Dispense   | ✅   | Verify → Dispense with name+time |
| Drug Inventory      | ✅   | Stock management, add stock |
| Billing (line items)| ✅   | Multi-item invoice, payment recording |
| Lab Result Entry    | ✅   | Lab tech enters result → Completed |
| Token Display TV    | ✅   | Public URL, no auth, auto-refresh |
| File Upload (Reports)| ✅  | PDF/image upload with notes |
| Superadmin Portal   | ✅   | Tenant CRUD, seed, activate |
| Settings            | ✅   | Profile, password, dept+doctors, display URL |

---

## API Endpoints Reference

| Endpoint                        | Method | Description |
|---------------------------------|--------|-------------|
| `/api/auth/login`               | POST   | Login, get JWT |
| `/api/patients`                 | GET/POST | Patient list/create |
| `/api/appointments`             | GET/POST | Appointments |
| `/api/appointments/:id/checkin` | POST   | Reception check-in |
| `/api/appointments/:id/call`    | POST   | Doctor calls patient |
| `/api/appointments/queue`       | GET    | Active queue |
| `/api/appointments/slots`       | GET    | Available time slots |
| `/api/users/doctors`            | GET    | Doctor availability |
| `/api/ipd`                      | GET/POST | IPD admissions |
| `/api/ipd/:id/rounds`           | POST   | Add nursing round |
| `/api/ipd/:id/discharge`        | POST   | Discharge patient |
| `/api/ipd/beds`                 | GET    | Bed occupancy map |
| `/api/prescriptions`            | GET/POST | Prescriptions |
| `/api/lab/orders`               | GET/POST | Lab orders |
| `/api/lab/orders/:id`           | PUT    | Update/enter result |
| `/api/pharmacy/orders`          | GET/POST | Pharmacy orders |
| `/api/pharmacy/orders/:id`      | PUT    | Verify/dispense |
| `/api/pharmacy/inventory`       | GET/POST | Drug inventory |
| `/api/billing`                  | GET/POST | Bills with line items |
| `/api/reports`                  | GET/POST | File uploads |
| `/api/public/display`           | GET    | Token display (no auth) |
| `/api/superadmin/tenants`       | GET/POST | Tenant management |
