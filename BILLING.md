# Carenoww HMS — Billing: Lock / Unlock Behavior

> Covers `server/models/BillingRecord.ts`, `server/services/billingService.ts`, `server/routes/billing.ts`

---

## What locks a bill

`isLocked` is set to `true` automatically whenever a bill's `paid` amount reaches its
`amount` (fully settled). It is recomputed on most billing operations, not just on payment:

| Operation | Where | Effect on `isLocked` |
|---|---|---|
| Create bill | `createBill` | `true` if paid ≥ amount at creation (non-draft) |
| Record payment | `postPayment` | `true` once cumulative `paid` ≥ `amount` |
| Update bill | `updateBill` | Recomputed every time: `finalPaid >= finalAmount` |
| Insurance settlement | insurance flow | `true` once settled ≥ amount |
| Return items | `returnBillItems` | `true` (bill closed out after return) |
| Cancel bill | `cancelBill` | `false` (cancellation forcibly unlocks) |
| Unlock | `unlockBill` | `false` |

## What locking blocks

Locking only protects **financial fields** on `PUT /api/billing/:id`. The guard lives in
`updateBill`:

```ts
const FINANCIAL_FIELDS = new Set(["items", "amount", "discount", "discountType", "discountPercent"]);

if (existing.isLocked) {
  const hasFinancialChange = Object.keys(body).some((k) => FINANCIAL_FIELDS.has(k));
  if (hasFinancialChange) {
    throw AppError.conflict("Bill is locked after full payment. Use /unlock to modify or record a credit note.");
  }
}
```

Non-financial fields (`notes`, `paymentMode`, `payer`, `status`) are **never** gated by
`isLocked` — those can always be edited via `PUT /api/billing/:id`, locked or not.

## Who can unlock

`POST /api/billing/:id/unlock` → `unlockBill()`

- **Role-gated to `admin` and `finance` only** (`server/routes/billing.ts`).
- Sets `isLocked: false` and appends an audit line to the bill's `notes` string, e.g.
  `\n[Unlocked by <name> on <date>]`.
- `notes` is a plain `String` field (not an array) on `BillingRecord` — the unlock note is
  appended via string concatenation, not `$push` (a `$push` against a string field throws
  `MongoServerError: The field 'notes' must be an array but is of type string`, which was a
  bug fixed on 2026-09-23).

## Who can edit once unlocked

`PUT /api/billing/:id` is role-gated to:
`admin`, `receptionist`, `nurse`, `finance`, `pharmacist`, `pharmacy_admin`.

That role list is **unconditional** — it doesn't change based on lock state. So once an
admin/finance user unlocks a bill, **any of those roles** (including `receptionist` and
`pharmacist`) can then edit financial fields (`items`, `discount`, etc.) on that bill via
the same PUT endpoint. There is no re-check of who performed the unlock vs. who performs
the subsequent edit.

## The unlock is not durable

`updateBill` recomputes `isLocked` on **every** `PUT` call:

```ts
update.isLocked = finalPaid >= finalAmount;
```

If a follow-up edit doesn't change the paid/amount relationship (e.g., items are re-saved
without changing the total, or paid still ≥ amount), the bill **re-locks itself on that
same save**. In practice, an unlock grants exactly one effective edit window — the edit
that actually needs to happen (changing items/discount so the total no longer equals paid)
— rather than leaving the bill open-ended.

## Practical implication

- To make an item/discount correction on a fully-paid bill: admin/finance unlocks it, then
  the edit must be submitted before another no-op save re-locks it.
- To leave a note or change payer/status on a locked bill: no unlock needed — those fields
  bypass the lock entirely.
- For refunds/voids after payment, prefer `/return` (returnBillItems) or a credit note over
  repeatedly unlocking — unlock is meant for correcting the original bill, not for
  reversing collected payments.
