# Carenoww HMS

Multi-tenant Hospital Management System — React 18 + Vite client, Express + MongoDB server, shipped as one Docker container (app + MongoDB single-node replica set) on port **5031**.

```bash
npm install
npm run dev        # client :3200, server :3201
npm run seed       # demo data (see DEMO_FLOWS.md for logins)
npm run build      # client + server bundle + migration scripts → dist/
```

---

## Deployment — IPD release (`ipd-improvements`)

This release adds the IPD rebuild (ward & bed master, inpatient chart, daily bed/nursing/diet charges, unpaid-balance check at discharge), patient history, ICD-10 codes, per-user rate limiting and auth hardening.

Pharmacy billing: drug MRP is no longer editable on the Billing screen. Inventory drug lines are always billed at the batch MRP (GRN) or the drug master MRP, and the server ignores any client-sent price. Use Discount for price cuts. The same drug can't be added twice when it has a single batch. The GRN item row is wider, so the MRP is fully visible.

It changes existing data (IPD admissions are re-keyed from patient `_id` to UHID), so **take a backup first**. All commands below run on the production host from the `carenoww/` folder. The container is `carenoww-app`.

### 1. Back up the database

Sign in to the Superadmin portal, open **Database Backup** and download a full dump. Keep the file until the release has been checked.

### 2. Get the release code

```bash
git fetch origin
git checkout main
git merge origin/ipd-improvements      # or: git pull, once the branch is merged into main
```

### 3. Rebuild and start the container

```bash
docker compose up -d --build           # older Docker: docker-compose up -d --build
docker compose logs -f app             # wait for "Starting Carenoww app...", then Ctrl+C
curl -fsS http://localhost:5031/api/health
```

The image build also bundles the migration scripts into `dist/scripts/`, which the commands below run.

### 4. Run the data migrations (in this order)

Run each one with `--dry-run` first where it has one, read the output, then run it for real. All are safe to re-run.

```bash
# a) IPD Phase 1: patientId → UHID, normalise beds, move transfer "rounds" to transfers[],
#    create the one-active-admission-per-bed / per-patient unique indexes, recompute Patient.status
docker exec carenoww-app node scripts/run-script.mjs migrate-ipd-phase1 --dry-run
docker exec carenoww-app node scripts/run-script.mjs migrate-ipd-phase1

# b) IPD wards: create Ward/Bed master entries from ward/bed names on existing admissions
#    and link those admissions to them (must run after a)
docker exec carenoww-app node scripts/run-script.mjs migrate-ipd-wards --dry-run
docker exec carenoww-app node scripts/run-script.mjs migrate-ipd-wards

# c) Referral fields: set referralSource="Doctor" on old doctor referrals that have no
#    source, so the Doctor count in Insights → By Source matches the Dashboard; trim
#    spaces around area / referrer names. Changes appointment data.
docker exec carenoww-app node scripts/run-script.mjs migrate-referral-fields --dry-run
docker exec carenoww-app node scripts/run-script.mjs migrate-referral-fields

# d) Rebuild the cached daily report totals, once. Late edits to appointments, lab
#    orders, bills and pharmacy orders now update them as they happen, but changes made
#    before this release never reached Insights. --from = first day with data,
#    --to = yesterday (not a future day). Past-day Insights numbers may change: they
#    are corrected to match the records. No dry run; only cached totals are rewritten.
docker exec carenoww-app node scripts/run-script.mjs refresh-rollups --from=YYYY-MM-DD --to=YYYY-MM-DD

# e) Bill line ids: finalizing a draft whose drug quantity split across batches gave
#    both batch lines the same id, so Return selected both rows. Gives each line its
#    own id; past returns stay on the line they were made against.
docker exec carenoww-app node scripts/run-script.mjs migrate-bill-item-ids --dry-run
docker exec carenoww-app node scripts/run-script.mjs migrate-bill-item-ids
```

If `migrate-ipd-phase1` reports **duplicate active admissions** (same bed or same patient twice), it skips creating the unique indexes. Discharge or fix the duplicates it lists, then run it again.

### 5. Load the ICD-10-CM catalogue

This loads the global code list (~98k codes) used by OPD and IPD diagnosis suggestions. The container needs internet access to download it from CMS.

```bash
docker exec carenoww-app node scripts/run-script.mjs import-icd-catalog
```

If the server has no internet access, download the CMS order file (`.zip` or `icd10cm_order_YYYY.txt`) on another machine and copy it in:

```bash
docker cp icd10cm_order_2026.zip carenoww-app:/tmp/
docker exec carenoww-app node scripts/run-script.mjs import-icd-catalog --file=/tmp/icd10cm_order_2026.zip
```

Use `--year=YYYY` for a newer release. Re-running the import refreshes the catalogue.

### 6. Set up each hospital (admin, in the app)

- **Settings → Service Rates:** make sure the daily charges exist (category Bed Charges/Room, or unit "per day").
- **Settings → Wards & Beds:** step 4 only creates beds that patients have used. Add the remaining wards and beds, set each ward's type (ICU wards drive the ICU count), and link each ward's daily charges (bed, nursing, diet…). A ward with no linked charges adds no daily charges to IPD bills.
- **Settings → ICD Codes → "Load common ICD-10 codes":** adds the ~270-code starter favourites for existing hospitals (new hospitals get them automatically).

### 7. Smoke test

- An admin, doctor and nurse can sign in. A user of a suspended hospital is signed out.
- IPD → Bed Map shows the wards, with current patients in their beds.
- Open an active admission's chart: vitals, notes, orders and the Bill tab load, and the Bill tab shows the daily charges.
- OPD Assessment shows ICD-10 suggestions while typing.
- Patients → View History shows visits and IPD stays.
- Billing → new Pharmacy bill: MRP is shown read-only, adding the same single-batch drug twice is blocked, and the saved line matches the inventory MRP.

### Rolling back

The migrations change admission data, so a rollback means both the old code and the backup:

```bash
git checkout <previous-release-commit>
docker compose up -d --build
```

Then restore the dump from step 1 in Superadmin → **Database Backup** (Restore).

---

## Other one-off scripts

All scripts are safe to re-run. In the container: `docker exec carenoww-app node scripts/run-script.mjs <name> [args]`. In dev: `npm run <script>`.

| npm script | Script name | Purpose |
|---|---|---|
| `migrate:referral-fields` | `migrate-referral-fields` | Legacy doctor referrals → `referralSource="Doctor"`, refresh rollups |
| `migrate:masters` | `migrate-backfill-masters` | Backfill referral doctor, area/VHN and supplier masters |
| `rollup:backfill` | `refresh-rollups` | Recompute cached daily report totals: `--from=YYYY-MM-DD --to=YYYY-MM-DD` |
| `rollup:refresh` | `refresh-rollups` | Recompute one day: `--date=YYYY-MM-DD` |
