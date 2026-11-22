/**
 * Drug tracking — one drug's full stock story: GRN receipts, bill sales,
 * cancellations, returns, adjustments and anything else that moved its stock,
 * reconciled against the stock on file.
 *
 * Model (all-time, so the period's opening balance is real):
 *   expected = opening-balance batches + Received GRNs − sold bill lines
 *              + cancelled-bill restocks + credit-note returns ± adjustments
 *              ± manual stock edits ± bill-edit corrections
 *   physical = DrugInventory.stock (sellable: Active batches)
 *              + units held in Expired / Quarantine batches
 *   unexplained = physical − expected
 *
 * Bill-edit corrections: edits to a finalized bill don't move stock
 * (billingService.updateBill), but the auto-note records what changed. A line
 * removed by edit was deducted at sale and never returned, so it still counts
 * as stock out; a line added by edit was never deducted; a quantity change only
 * deducted the original quantity. Parsing those notes keeps the ledger true to
 * what actually left the shelf.
 *
 * Read-only: never writes anything.
 */
import mongoose from "mongoose";
import DrugInventory from "../models/DrugInventory.js";
import DrugBatch from "../models/DrugBatch.js";
import GRN from "../models/GRN.js";
import BillingRecord from "../models/BillingRecord.js";
import StockAdjustment from "../models/StockAdjustment.js";
import InventoryAuditLog from "../models/InventoryAuditLog.js";
import { AppError } from "../lib/AppError.js";
import { dateStrInTz, startOfDayUtc, endOfDayUtc, todayInTz } from "../lib/dateUtils.js";

export type LedgerType =
  | "Opening"      // OPENING-BAL batch (stock carried into batch tracking)
  | "GRN"          // received purchase
  | "Sale"         // bill line
  | "Cancel"       // cancelled bill restocked
  | "Return"       // credit-note return restocked
  | "Adjustment"   // stock adjustment (damage, count correction, …)
  | "Manual"       // stock overwritten on the drug master (non-batch drugs)
  | "BillEdit";    // edit to a finalized bill that changed this drug without moving stock

export interface LedgerRow {
  at: string;          // ISO timestamp
  date: string;        // YYYY-MM-DD in tenant tz
  type: LedgerType;
  ref: string;         // GRN-…, PHC-…, CN-…, ADJ-…
  refId?: string;      // mongo id of the source document
  party: string;       // supplier / patient / user
  batchNo: string;
  qty: number;         // signed: + into stock, − out of stock
  amount: number;      // money value of the movement (sale total, purchase cost)
  note: string;
  balance: number;     // running expected balance after this row
  inPeriod: boolean;
}

export interface Finding {
  level: "info" | "warning" | "critical";
  title: string;
  detail: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const norm = (s: string) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");
const fmtDay = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
};

// "Bill edited by X on 10 Oct 2026, 11:59 am: added A [B1] ×1; removed C [B2] ×30; D qty 10 → 5; …"
function parseBillEditNote(text: string): { kind: "added" | "removed" | "qty"; name: string; batchNo: string; delta: number }[] {
  if (!text.startsWith("Bill edited by ")) return [];
  const idx = text.indexOf(": ");
  if (idx < 0) return [];
  const out: { kind: "added" | "removed" | "qty"; name: string; batchNo: string; delta: number }[] = [];
  const splitKey = (key: string) => {
    const m = key.match(/^(.*?)(?: \[([^\]]*)\])?$/);
    return { name: (m?.[1] ?? key).trim(), batchNo: (m?.[2] ?? "").trim() };
  };
  for (const part of text.slice(idx + 2).split("; ")) {
    let m = part.match(/^added (.+) ×(-?[\d.]+)$/);
    if (m) { out.push({ kind: "added", ...splitKey(m[1]), delta: Number(m[2]) }); continue; }
    m = part.match(/^removed (.+) ×(-?[\d.]+)$/);
    if (m) { out.push({ kind: "removed", ...splitKey(m[1]), delta: Number(m[2]) }); continue; }
    m = part.match(/^(.+) qty (-?[\d.]+) → (-?[\d.]+)$/);
    if (m) { out.push({ kind: "qty", ...splitKey(m[1]), delta: Number(m[2]) - Number(m[3]) }); }
  }
  return out;
}

export async function getDrugTracking(
  tenantId: string,
  drugId: string,
  opts: { from?: string; to?: string; tz?: string } = {}
) {
  if (!mongoose.isValidObjectId(drugId)) throw AppError.badRequest("Invalid drug id");
  const tz = opts.tz || "Asia/Kolkata";
  const tid = new mongoose.Types.ObjectId(tenantId);
  const did = new mongoose.Types.ObjectId(drugId);

  const drug = await DrugInventory.findOne({ _id: did, tenantId: tid }).lean<any>();
  if (!drug) throw AppError.notFound("Drug not found");

  const today = todayInTz(tz);
  const to = opts.to && /^\d{4}-\d{2}-\d{2}$/.test(opts.to) ? opts.to : today;
  const from = opts.from && /^\d{4}-\d{2}-\d{2}$/.test(opts.from)
    ? opts.from
    : dateStrInTz(new Date(startOfDayUtc(to, tz).getTime() - 89 * 86_400_000), tz);
  const fromAt = startOfDayUtc(from, tz);
  const toAt = endOfDayUtc(to, tz);

  const drugIdStr = String(did);
  const [grnDocs, billDocs, creditDocs, adjustments, audits, batches] = await Promise.all([
    GRN.find({ tenantId: tid, "items.drugId": did }).sort({ receivedDate: 1 }).lean<any[]>(),
    BillingRecord.find({ tenantId: tid, docType: { $ne: "CreditNote" }, "items.drugId": drugIdStr })
      .select("billId patientId patientName date status type docType cancelledAt cancelledBy items createdAt createdBy")
      .sort({ date: 1 }).lean<any[]>(),
    BillingRecord.find({ tenantId: tid, docType: "CreditNote", "items.drugId": drugIdStr })
      .select("billId patientName date originalBillNo items createdBy createdAt")
      .sort({ date: 1 }).lean<any[]>(),
    StockAdjustment.find({ tenantId: tid, drugId: did }).sort({ createdAt: 1 }).lean<any[]>(),
    InventoryAuditLog.find({ tenantId: tid, drugId: did }).sort({ createdAt: 1 }).lean<any[]>(),
    DrugBatch.find({ tenantId: tid, drugId: did }).sort({ createdAt: 1 }).lean<any[]>(),
  ]);

  // Bills whose edit notes may mention this drug by name (edits keep the drug
  // line's description, which is the drug name at the time of sale).
  const names = new Set<string>([norm(drug.name)]);
  for (const b of billDocs) for (const it of b.items) if (it.drugId === drugIdStr && it.description) names.add(norm(it.description));
  const nameRe = new RegExp([...names].map(escapeRe).join("|"), "i");
  const editedBills = await BillingRecord.find({
    tenantId: tid, docType: { $ne: "CreditNote" }, status: { $ne: "Draft" },
    notes: { $elemMatch: { text: { $regex: nameRe } } },
  }).select("billId patientName date status cancelledAt notes items").lean<any[]>();

  const rows: Omit<LedgerRow, "balance" | "inPeriod">[] = [];
  const push = (at: Date, r: Omit<LedgerRow, "balance" | "inPeriod" | "at" | "date">) =>
    rows.push({ at: at.toISOString(), date: dateStrInTz(at, tz), ...r });

  // ── Opening-balance batches (pre-existing stock migrated into batch tracking)
  for (const b of batches) {
    if (b.batchNo === "OPENING-BAL" && !b.grnId) {
      push(new Date(b.createdAt), { type: "Opening", ref: "Opening balance", refId: String(b._id), party: "", batchNo: b.batchNo, qty: b.quantityReceived, amount: 0, note: "Stock on hand when the drug moved to batch tracking" });
    }
  }

  // ── GRNs
  const grns = grnDocs.flatMap((g) => g.items
    .filter((it: any) => String(it.drugId) === drugIdStr)
    .map((it: any) => ({
      id: String(g._id), grnId: g.grnId, status: g.status,
      receivedDate: (g.receivedDate ?? g.createdAt) as Date,
      supplierName: g.supplierName, invoiceNo: g.invoiceNo || "", receivedBy: g.receivedBy || "",
      batchNo: it.batchNo, expiryDate: it.expiryDate, quantity: it.quantityReceived,
      purchasePricePerUnit: it.purchasePricePerUnit ?? 0, mrpPerUnit: it.mrpPerUnit ?? 0,
      totalCost: it.totalCost ?? 0,
      editedAfterReceipt: g.status === "Received" && g.updatedAt && g.createdAt
        && new Date(g.updatedAt).getTime() - new Date(g.createdAt).getTime() > 60_000,
    })));
  for (const g of grns) {
    if (g.status !== "Received") continue;
    push(new Date(g.receivedDate), { type: "GRN", ref: g.grnId, refId: g.id, party: g.supplierName, batchNo: g.batchNo, qty: g.quantity, amount: g.totalCost, note: g.invoiceNo ? `Invoice ${g.invoiceNo}` : "" });
  }

  // ── Sales (current bill lines; Draft bills haven't moved stock)
  const bills = billDocs.filter((b) => b.status !== "Draft").map((b) => {
    const lines = b.items.filter((it: any) => it.drugId === drugIdStr);
    return {
      id: String(b._id), billId: b.billId, date: (b.date ?? b.createdAt) as Date, type: b.type, status: b.status,
      patientId: b.patientId, patientName: b.patientName, createdBy: b.createdBy || "",
      cancelledAt: b.cancelledAt as Date | undefined,
      batchNos: [...new Set(lines.map((l: any) => l.batchNo).filter(Boolean))].join(", "),
      quantity: lines.reduce((s: number, l: any) => s + (Number(l.quantity) || 0), 0),
      unitPrice: lines[0]?.unitPrice ?? 0,
      total: round2(lines.reduce((s: number, l: any) => s + (Number(l.total) || 0), 0)),
    };
  }).filter((b) => b.quantity > 0);
  for (const b of bills) {
    push(new Date(b.date), { type: "Sale", ref: b.billId, refId: b.id, party: b.patientName || "", batchNo: b.batchNos, qty: -b.quantity, amount: b.total, note: b.status === "Cancelled" ? "Bill later cancelled" : "" });
  }
  const draftBills = billDocs.filter((b) => b.status === "Draft").length;

  // ── Cancellations: restock audit entries, grouped by bill. A bill that is still
  // Cancelled restocked exactly its current lines; one edited after the cancel
  // falls back to the audit's stock delta.
  const billByNo = new Map<string, any>();
  for (const b of [...billDocs, ...editedBills]) billByNo.set(b.billId, b);
  const cancelByBill = new Map<string, { at: Date; delta: number; by: string }>();
  const otherAudits: any[] = [];
  for (const a of audits) {
    const notes: string = a.notes || "";
    const stockChange = (a.changes || []).find((c: any) => c.field === "stock");
    const delta = stockChange ? Number(stockChange.newValue) - Number(stockChange.oldValue) : 0;
    const m = notes.match(/^Reversed by cancellation of bill (.+)$/);
    if (m) {
      const cur = cancelByBill.get(m[1]);
      cancelByBill.set(m[1], { at: cur?.at ?? new Date(a.createdAt), delta: (cur?.delta ?? 0) + delta, by: a.performedBy || "" });
      continue;
    }
    // Returns (credit notes), GRN cancellations (GRN excluded) and batch-tracking
    // migration (OPENING-BAL batch) are counted from their own records.
    if (/^Returned via /.test(notes) || /^Reversed by GRN /.test(notes) || /^Migrated /.test(notes) || /^Batch .* edited$/.test(notes)) continue;
    if (stockChange && delta !== 0) otherAudits.push({ ...a, delta });
  }
  const cancellations: { billId: string; billRef?: string; at: Date; quantity: number; by: string; stillCancelled: boolean }[] = [];
  for (const [billNo, c] of cancelByBill) {
    const bill = billByNo.get(billNo);
    const stillCancelled = bill?.status === "Cancelled";
    const qty = stillCancelled
      ? bill.items.filter((it: any) => it.drugId === drugIdStr).reduce((s: number, l: any) => s + (Number(l.quantity) || 0), 0)
      : c.delta;
    cancellations.push({ billId: billNo, billRef: bill ? String(bill._id) : undefined, at: c.at, quantity: qty, by: c.by, stillCancelled });
    push(c.at, { type: "Cancel", ref: billNo, refId: bill ? String(bill._id) : undefined, party: bill?.patientName || "", batchNo: "", qty, amount: 0, note: stillCancelled ? `Cancelled by ${c.by}` : `Cancelled by ${c.by}; bill was edited afterwards and is now ${bill?.status ?? "missing"}` });
  }

  // ── Returns (credit notes)
  const returns = creditDocs.map((cn) => {
    const lines = cn.items.filter((it: any) => it.drugId === drugIdStr);
    return {
      id: String(cn._id), creditNoteId: cn.billId, date: (cn.date ?? cn.createdAt) as Date,
      originalBillNo: cn.originalBillNo || "", patientName: cn.patientName || "", by: cn.createdBy || "",
      batchNos: [...new Set(lines.map((l: any) => l.batchNo).filter(Boolean))].join(", "),
      quantity: lines.reduce((s: number, l: any) => s + Math.abs(Number(l.quantity) || 0), 0),
      total: round2(lines.reduce((s: number, l: any) => s + Math.abs(Number(l.total) || 0), 0)),
    };
  }).filter((r) => r.quantity > 0);
  for (const r of returns) {
    push(new Date(r.date), { type: "Return", ref: r.creditNoteId, refId: r.id, party: r.patientName, batchNo: r.batchNos, qty: r.quantity, amount: r.total, note: r.originalBillNo ? `Return on ${r.originalBillNo}` : "" });
  }

  // ── Stock adjustments
  const adjustmentRows = adjustments.map((a) => ({
    id: String(a._id), adjustmentId: a.adjustmentId, date: a.createdAt as Date, type: a.adjustmentType,
    quantity: a.quantityAdjusted, before: a.quantityBefore, after: a.quantityAfter, reason: a.reason, by: a.adjustedBy,
  }));
  for (const a of adjustmentRows) {
    push(new Date(a.date), { type: "Adjustment", ref: a.adjustmentId, refId: a.id, party: a.by, batchNo: "", qty: a.quantity, amount: 0, note: `${a.type}${a.reason ? ` — ${a.reason}` : ""}` });
  }

  // ── Manual stock edits on the drug master (non-batch drugs only)
  for (const a of otherAudits) {
    push(new Date(a.createdAt), { type: "Manual", ref: "Stock edit", refId: String(a._id), party: a.performedBy || "", batchNo: "", qty: a.delta, amount: 0, note: a.notes || "Stock changed on the drug master without a stock adjustment" });
  }

  // ── Finalized-bill edits that changed this drug without moving stock
  const billEdits: { billId: string; billRef: string; at: Date; by: string; change: string; qty: number }[] = [];
  for (const b of editedBills) {
    for (const n of b.notes || []) {
      for (const ch of parseBillEditNote(n.text || "")) {
        if (!names.has(norm(ch.name))) continue;
        // removed: the units left the shelf at sale and were never put back → still out.
        // added: the line never deducted stock → give it back. qty a → b: only a was deducted.
        const qty = ch.kind === "removed" ? -ch.delta : ch.kind === "added" ? ch.delta : -ch.delta;
        if (!qty) continue;
        const change = ch.kind === "removed" ? `Removed ×${ch.delta} from bill (stock not returned)`
          : ch.kind === "added" ? `Added ×${ch.delta} to bill (stock not deducted)`
          : `Qty changed on bill by ${-ch.delta > 0 ? "+" : ""}${-ch.delta} (stock not adjusted)`;
        billEdits.push({ billId: b.billId, billRef: String(b._id), at: new Date(n.createdAt), by: n.authorName || "", change, qty });
        push(new Date(n.createdAt), { type: "BillEdit", ref: b.billId, refId: String(b._id), party: n.authorName || "", batchNo: ch.batchNo, qty, amount: 0, note: change });
      }
    }
  }

  // ── Ledger with running balance
  const typeOrder: Record<LedgerType, number> = { Opening: 0, GRN: 1, Return: 2, Cancel: 3, Adjustment: 4, Manual: 5, Sale: 6, BillEdit: 7 };
  rows.sort((a, b) => a.at.localeCompare(b.at) || typeOrder[a.type] - typeOrder[b.type]);
  let balance = 0;
  let stockOutAt: string | null = null;   // set while the expected balance is ≤ 0 (since when)
  const stockOuts: { from: string; to: string | null; fromRef: string; toRef: string | null; days: number }[] = [];
  const ledger: LedgerRow[] = rows.map((r) => {
    const before = balance;
    balance = round2(balance + r.qty);
    if (before > 0 && balance <= 0) {
      stockOutAt = r.at;
      stockOuts.push({ from: r.at, to: null, fromRef: r.ref, toRef: null, days: 0 });
    } else if (before <= 0 && balance > 0 && stockOutAt) {
      stockOutAt = null;
      const s = stockOuts[stockOuts.length - 1];
      s.to = r.at; s.toRef = r.ref;
    }
    const at = new Date(r.at);
    return { ...r, balance, inPeriod: at >= fromAt && at <= toAt };
  });
  const expectedNow = balance;
  for (const s of stockOuts) {
    const end = s.to ? new Date(s.to) : new Date();
    s.days = Math.max(0, Math.round((end.getTime() - new Date(s.from).getTime()) / 86_400_000));
  }

  // ── Period summary
  const before = ledger.filter((r) => new Date(r.at) < fromAt);
  const inPeriod = ledger.filter((r) => r.inPeriod);
  const opening = before.length ? before[before.length - 1].balance : 0;
  const sum = (arr: LedgerRow[], t: LedgerType[]) => round2(arr.filter((r) => t.includes(r.type)).reduce((s, r) => s + r.qty, 0));
  const received = sum(inPeriod, ["GRN", "Opening"]);
  const sold = -sum(inPeriod, ["Sale"]);
  const cancelled = sum(inPeriod, ["Cancel"]);
  const returned = sum(inPeriod, ["Return"]);
  const adjusted = sum(inPeriod, ["Adjustment", "Manual"]);
  const billEdited = sum(inPeriod, ["BillEdit"]);
  const closing = inPeriod.length ? inPeriod[inPeriod.length - 1].balance : opening;

  const heldStatuses = new Set(["Expired", "Quarantine"]);
  const held = batches.filter((b) => heldStatuses.has(b.status)).reduce((s, b) => s + (b.quantityRemaining || 0), 0);
  const actualStock = Number(drug.stock) || 0;
  const unexplained = round2(actualStock + held - expectedNow);

  // ── Batch reconciliation: received − sold − edited + cancelled/returned (matched by batch no.)
  const batchRows = batches.map((b) => {
    const soldFromBatch = billDocs.filter((x) => x.status !== "Draft").reduce((s, x) => s + x.items
      .filter((it: any) => it.drugId === drugIdStr && (it.batchId ? it.batchId === String(b._id) : false))
      .reduce((ss: number, it: any) => ss + (Number(it.quantity) || 0), 0), 0);
    return {
      id: String(b._id), batchNo: b.batchNo, grnId: b.grnId ? String(b.grnId) : null,
      grnNo: grnDocs.find((g) => String(g._id) === String(b.grnId))?.grnId ?? (b.batchNo === "OPENING-BAL" ? "Opening" : b.supplierName === "Customer Return" ? "Return" : ""),
      supplierName: b.supplierName, receivedAt: b.createdAt, expiryDate: b.expiryDate,
      quantityReceived: b.quantityReceived, quantityRemaining: b.quantityRemaining, status: b.status,
      mrpPerUnit: b.mrpPerUnit ?? 0, soldByBatchId: soldFromBatch,
    };
  });

  // ── Stats
  const periodDays = Math.max(1, Math.round((toAt.getTime() - fromAt.getTime()) / 86_400_000));
  const periodSales = bills.filter((b) => b.date >= fromAt && b.date <= toAt);
  const salesValue = round2(periodSales.reduce((s, b) => s + b.total, 0));
  const avgDaily = round2(sold / periodDays);
  // Recent pace (last 30 days to `to`) drives days-of-cover and the stock-out estimate.
  const last30From = new Date(toAt.getTime() - 30 * 86_400_000);
  const last30Sold = bills.filter((b) => b.date >= last30From && b.date <= toAt).reduce((s, b) => s + b.quantity, 0);
  const pace30 = round2(last30Sold / 30);
  const receivedGrns = grns.filter((g) => g.status === "Received");
  const lastGrn = receivedGrns[receivedGrns.length - 1] ?? null;
  const lastSale = bills[bills.length - 1] ?? null;
  const soldSinceLastGrn = lastGrn ? bills.filter((b) => b.date >= lastGrn.receivedDate).reduce((s, b) => s + b.quantity, 0) : 0;
  const avgPurchasePrice = receivedGrns.length
    ? round2(receivedGrns.reduce((s, g) => s + g.purchasePricePerUnit * g.quantity, 0) / Math.max(1, receivedGrns.reduce((s, g) => s + g.quantity, 0)))
    : 0;
  const avgSalePrice = sold ? round2(salesValue / sold) : 0;

  const monthlyMap = new Map<string, { month: string; received: number; sold: number; returned: number; adjusted: number; closing: number }>();
  for (const r of inPeriod) {
    const k = r.date.slice(0, 7);
    const m = monthlyMap.get(k) ?? { month: k, received: 0, sold: 0, returned: 0, adjusted: 0, closing: 0 };
    if (r.type === "GRN" || r.type === "Opening") m.received += r.qty;
    else if (r.type === "Sale") m.sold += -r.qty;
    else if (r.type === "Return" || r.type === "Cancel") m.returned += r.qty;
    else m.adjusted += r.qty;
    m.closing = r.balance;
    monthlyMap.set(k, m);
  }
  const monthly = [...monthlyMap.values()].map((m) => ({ ...m, received: round2(m.received), sold: round2(m.sold), returned: round2(m.returned), adjusted: round2(m.adjusted) }));

  // ── Diagnosis
  const findings: Finding[] = [];
  const activeBatches = batches.filter((b) => b.status === "Active" && b.quantityRemaining > 0);
  if (actualStock <= 0) {
    if (Math.abs(unexplained) < 0.01) {
      const tail = lastGrn
        ? `The last GRN was ${lastGrn.grnId} on ${fmtDay(dateStrInTz(lastGrn.receivedDate, tz))} (${lastGrn.quantity} ${drug.unit || "units"}, batch ${lastGrn.batchNo}). Since then ${soldSinceLastGrn} were sold${stockOutAt ? `, and stock ran out on ${fmtDay(dateStrInTz(new Date(stockOutAt), tz))}` : ""}.`
        : "No GRN has ever been received for this drug.";
      const backIn = round2(cancellations.reduce((s, c) => s + c.quantity, 0) + returns.reduce((s, r) => s + r.quantity, 0));
      findings.push({ level: "critical", title: "Sold out — every unit received has been billed", detail: `The records fully explain the 0: ${round2(receivedGrns.reduce((s, g) => s + g.quantity, 0))} received on ${receivedGrns.length} GRN(s), ${soldTotal(bills)} billed on ${bills.length} bill(s)${backIn ? `, ${backIn} back from cancellations/returns` : ""}. ${tail} Receive a GRN to restock.` });
    } else {
      findings.push({ level: "critical", title: "Stock is 0 but the records don't add up", detail: `Records say ${expectedNow} should be on hand but stock is ${actualStock}${held ? ` (+${held} held in Expired/Quarantine batches)` : ""}. See the unexplained difference below.` });
    }
  } else if (drug.reorderLevel && actualStock <= drug.reorderLevel) {
    findings.push({ level: "warning", title: `Below reorder level (${actualStock} ≤ ${drug.reorderLevel})`, detail: pace30 ? `At the last 30 days' pace of ${pace30}/day this lasts about ${Math.floor(actualStock / pace30)} more day(s).` : "No sales in the last 30 days." });
  }
  if (Math.abs(unexplained) >= 0.01) {
    findings.push({
      level: "critical",
      title: `Unexplained difference of ${unexplained > 0 ? "+" : ""}${unexplained}`,
      detail: `Stock on hand (${actualStock}${held ? ` + ${held} held` : ""}) differs from what GRNs, bills, returns and adjustments add up to (${expectedNow}). ${unexplained < 0 ? "Units left without a record — e.g. a GRN quantity edited after receipt (batches keep the original), the opening stock entered when the drug was created, or a direct database edit." : "More stock than the records explain — e.g. opening stock entered when the drug was created, or a GRN edited after receipt."}`,
    });
  }
  const periodStockOuts = stockOuts.filter((s) => new Date(s.from) <= toAt && (!s.to || new Date(s.to) >= fromAt));
  const pastStockOuts = periodStockOuts.filter((s) => s.to);
  if (pastStockOuts.length) {
    findings.push({
      level: "warning",
      title: `Ran out of stock ${pastStockOuts.length} time(s) in this period`,
      detail: pastStockOuts.map((s) => `${fmtDay(dateStrInTz(new Date(s.from), tz))} (after ${s.fromRef}) → ${fmtDay(dateStrInTz(new Date(s.to!), tz))} (${s.toRef}), ${s.days} day(s) at 0`).join("; ")
        + ". Stock showed 0 between those dates until the next GRN arrived.",
    });
  }
  if (held > 0) findings.push({ level: "warning", title: `${held} unit(s) held in Expired/Quarantine batches`, detail: "These are counted physically but can't be sold, so they don't show in stock." });
  if (actualStock > 0 && !activeBatches.length && drug.isBatchTracked) findings.push({ level: "warning", title: "Stock shown but no active batch", detail: "Stock should equal the sum of active batches — re-save a batch or contact support." });
  if (drug.isActive === false) findings.push({ level: "warning", title: "Drug is deactivated", detail: "It won't appear in billing or GRN pickers." });
  if (draftBills) findings.push({ level: "info", title: `${draftBills} draft bill(s) include this drug`, detail: "Drafts don't deduct stock until finalized — finalizing them will need that stock." });
  for (const c of cancellations.filter((x) => !x.stillCancelled)) {
    findings.push({ level: "warning", title: `Bill ${c.billId} was cancelled and then edited`, detail: `Cancelling it returned ${c.quantity} to stock on ${fmtDay(dateStrInTz(c.at, tz))}; it was then edited back to ${billByNo.get(c.billId)?.status ?? "another status"}. Edits to a finalized bill never move stock, so new lines on it were not deducted.` });
  }
  if (billEdits.length) findings.push({ level: "info", title: `${billEdits.length} bill edit(s) changed this drug without moving stock`, detail: billEdits.map((e) => `${e.billId}: ${e.change}`).join("; ") });
  const editedGrns = grns.filter((g) => g.editedAfterReceipt);
  if (editedGrns.length) findings.push({ level: "warning", title: `${editedGrns.length} GRN(s) edited after receipt`, detail: `${editedGrns.map((g) => g.grnId).join(", ")} — editing a Received GRN doesn't change its batches, so check the quantities match.` });
  if (!findings.length) findings.push({ level: "info", title: "Stock reconciles", detail: `Everything received, sold, returned and adjusted adds up to the ${actualStock} on hand.` });

  return {
    drug: {
      id: drugIdStr, name: drug.name, unit: drug.unit || "", stock: actualStock, reorderLevel: drug.reorderLevel ?? 0,
      status: drug.status, isBatchTracked: !!drug.isBatchTracked, isActive: drug.isActive !== false,
      mrpPerUnit: drug.mrpPerUnit ?? 0, createdAt: drug.createdAt,
    },
    period: { from, to, days: periodDays },
    summary: { opening, received, sold, cancelled, returned, adjusted, billEdited, closing, expectedNow, actualStock, held, unexplained },
    stats: {
      salesValue, billCount: periodSales.length, avgDaily, pace30,
      daysOfCover: pace30 > 0 ? Math.floor(actualStock / pace30) : null,
      lastGrnAt: lastGrn?.receivedDate ?? null, lastGrnNo: lastGrn?.grnId ?? null, lastGrnQty: lastGrn?.quantity ?? 0,
      lastSaleAt: lastSale?.date ?? null, lastSaleNo: lastSale?.billId ?? null,
      soldSinceLastGrn, stockOutAt, avgPurchasePrice, avgSalePrice,
      totalReceivedAllTime: round2(receivedGrns.reduce((s, g) => s + g.quantity, 0)),
      totalSoldAllTime: soldTotal(bills),
    },
    findings,
    stockOuts: periodStockOuts,
    monthly,
    ledger,
    grns: grns.map((g) => ({ ...g, inPeriod: g.receivedDate >= fromAt && g.receivedDate <= toAt })),
    bills: bills.map((b) => ({ ...b, inPeriod: b.date >= fromAt && b.date <= toAt })),
    returns,
    cancellations,
    adjustments: adjustmentRows,
    billEdits,
    batches: batchRows,
  };
}

function soldTotal(bills: { quantity: number }[]) {
  return round2(bills.reduce((s, b) => s + b.quantity, 0));
}

/** Find a drug by tenant (id, slug or name) + drug name fragment — used by the CLI. */
export async function findDrugForCli(tenantQuery: string, drugQuery: string) {
  const Tenant = (await import("../models/Tenant.js")).default;
  const tenant = mongoose.isValidObjectId(tenantQuery)
    ? await Tenant.findById(tenantQuery).lean<any>()
    : await Tenant.findOne({ $or: [{ slug: tenantQuery }, { name: { $regex: escapeRe(tenantQuery), $options: "i" } }] }).lean<any>();
  if (!tenant) throw new Error(`Tenant "${tenantQuery}" not found`);
  const drugs = mongoose.isValidObjectId(drugQuery)
    ? await DrugInventory.find({ _id: drugQuery, tenantId: tenant._id }).lean<any[]>()
    : await DrugInventory.find({ tenantId: tenant._id, name: { $regex: escapeRe(drugQuery), $options: "i" } }).lean<any[]>();
  return { tenant, drugs };
}
