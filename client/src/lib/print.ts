// ── Print utilities — opens a formatted page in a new window and auto-prints ──
import { LAB_TEST_MASTER } from "./labTestMaster";

export type InvoiceStyle = "classic" | "modern" | "minimal" | "thermal" | "compact";

export interface ClinicInfo {
  name: string;
  logoUrl?: string;
  phone?: string;
  address?: string;
  city?: string;
  gstNo?: string;
  invoiceStyle?: InvoiceStyle;
}

const DEFAULT_CLINIC: ClinicInfo = {
  name:    "Carenow",
  phone:   "",
  address: "",
  city:    "",
};

function getStoredClinic(): ClinicInfo {
  try {
    const stored = localStorage.getItem("carenoww_user");
    if (stored) {
      const u = JSON.parse(stored);
      return {
        name:         u.organization  || DEFAULT_CLINIC.name,
        logoUrl:      u.clinicLogoUrl || "",
        phone:        u.clinicPhone   || "",
        address:      u.clinicAddress || "",
        city:         u.clinicCity    || "",
        invoiceStyle: u.invoiceStyle  || "classic",
      };
    }
  } catch {}
  return DEFAULT_CLINIC;
}

function clinicHeader(clinic: ClinicInfo, docLabel?: string): string {
  const sub = [clinic.phone, clinic.address, clinic.city].filter(Boolean).join("  ·  ");
  const gstLine = clinic.gstNo ? `GSTIN: ${clinic.gstNo}` : "";
  const logoHtml = clinic.logoUrl
    ? `<img src="${clinic.logoUrl}" alt="logo" style="height:56px;width:auto;object-fit:contain;margin-bottom:6px;" /><br/>`
    : "";
  return `
  <div class="hdr">
    ${logoHtml}
    <div class="name">${clinic.name}</div>
    ${sub ? `<div class="sub">${sub}</div>` : ""}
    ${gstLine ? `<div class="sub" style="color:#333;font-weight:600;">${gstLine}</div>` : ""}
    ${docLabel ? `<div style="font-size:12px;font-weight:700;letter-spacing:.8px;margin-top:4px;text-transform:uppercase;">${docLabel}</div>` : ""}
  </div>`;
}

function base(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#111;background:#fff;padding:0;}
    @page{size:A4;margin:18mm 14mm;}
    .page{max-width:760px;margin:auto;padding:20px;}

    /* header */
    .hdr{text-align:center;border-bottom:2.5px solid #111;padding-bottom:12px;margin-bottom:14px;}
    .hdr .name{font-size:22px;font-weight:800;letter-spacing:.5px;}
    .hdr .sub{font-size:11px;color:#555;margin-top:3px;}

    /* doc title row */
    .doc-row{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;}
    .doc-title{font-size:18px;font-weight:700;font-style:italic;}
    .doc-id{font-size:12px;color:#555;text-align:right;}
    .badge{display:inline-block;padding:2px 9px;border-radius:4px;font-size:11px;font-weight:600;background:#e8f5f3;color:#1a6b5e;border:1px solid #aed7d1;}

    /* meta grid */
    .meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin-bottom:14px;padding:10px 14px;background:#f8f8f8;border:1px solid #e0e0e0;border-radius:6px;}
    .meta-item label{font-size:10px;color:#888;display:block;text-transform:uppercase;letter-spacing:.4px;}
    .meta-item span{font-size:13px;font-weight:600;}

    /* table */
    table{width:100%;border-collapse:collapse;margin:10px 0 6px;}
    th{background:#f0f0f0;border:1px solid #ccc;padding:6px 8px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.3px;}
    td{border:1px solid #ddd;padding:6px 8px;font-size:12px;vertical-align:top;}
    tr:nth-child(even) td{background:#fafafa;}
    .tr{text-align:right;} .tc{text-align:center;}

    /* summary */
    .summary{margin-left:auto;width:280px;border:1px solid #ddd;border-radius:6px;overflow:hidden;}
    .summary table{margin:0;}
    .summary td{border:none;border-bottom:1px solid #eee;padding:5px 10px;}
    .summary tr:last-child td{border-bottom:none;}
    .tot-row td{font-weight:800;font-size:14px;background:#f0f0f0;border-top:2px solid #999!important;}
    .paid-row td{color:#15803d;font-weight:700;}
    .bal-row td{color:#dc2626;font-weight:700;}

    /* drug rows */
    .drug{margin-bottom:14px;padding:8px 12px;border-left:4px solid #1a6b5e;background:#f8fffe;}
    .drug .d-name{font-size:14px;font-weight:700;margin-bottom:3px;}
    .drug .d-detail{font-size:12px;color:#444;line-height:1.6;}
    .drug .d-note{font-size:11px;color:#777;font-style:italic;margin-top:2px;}

    /* notes box */
    .notes{margin-top:14px;padding:9px 12px;background:#fffbf0;border:1px solid #e5d68a;border-radius:5px;font-size:12px;}
    .notes strong{display:block;margin-bottom:3px;color:#92400e;}

    /* signature */
    .sig-wrap{display:flex;justify-content:flex-end;margin-top:36px;}
    .sig{width:220px;border-top:1px solid #555;text-align:center;padding-top:5px;font-size:11px;color:#555;}

    /* footer */
    .footer{margin-top:22px;padding-top:10px;border-top:1px solid #ddd;text-align:center;font-size:11px;color:#888;line-height:1.6;}

    /* page-break helpers */
    tr{page-break-inside:avoid;}
    .no-break{page-break-inside:avoid;}

    /* lab param table */
    .param-section{margin-bottom:14px;}
    .param-section .test-name{font-size:13px;font-weight:700;background:#e8f5f3;border:1px solid #aed7d1;padding:5px 10px;border-radius:4px 4px 0 0;color:#1a6b5e;}
    .param-table{width:100%;border-collapse:collapse;margin:0 0 4px;}
    .param-table th{background:#f5f5f5;border:1px solid #ddd;padding:5px 8px;font-size:10px;text-transform:uppercase;letter-spacing:.3px;}
    .param-table td{border:1px solid #e8e8e8;padding:5px 8px;font-size:12px;}
    .param-table tr:nth-child(even) td{background:#fafafa;}
    .param-table .val-cell{font-weight:700;color:#1a3c5e;}
    .param-table .ref-cell{color:#777;font-size:11px;font-style:italic;}

    @media print{.no-print{display:none!important;}}
  </style>
</head>
<body>
<div class="page">
${body}
</div>
<script>
  window.addEventListener("load", () => {
    window.print();
    window.addEventListener("afterprint", () => window.close());
  });
</script>
</body>
</html>`;
}

// ── baseA5 — half-A4 (A5) page wrapper ───────────────────────────────────────
function baseA5(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${title}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111;background:#fff;}
    @page{size:A5 landscape;margin:8mm 12mm;}
    .page{max-width:700px;margin:auto;padding:14px;}
    tr{page-break-inside:avoid;}
    .no-break{page-break-inside:avoid;}
    @media print{.no-print{display:none!important;}}
  </style>
</head>
<body>
<div class="page">
${body}
</div>
<script>
  window.addEventListener("load",()=>{window.print();window.addEventListener("afterprint",()=>window.close());});
</script>
</body>
</html>`;
}

// ── Bill body builders ────────────────────────────────────────────────────────

function _billMeta(bill: any, clinic: ClinicInfo, hasGst: boolean | string | undefined) {
  const subtotal = ((bill.items || []) as any[]).reduce((s: number, i: any) => s + (i.total || 0), 0);
  const gstSummary = hasGst ? `
    <tr><td>Taxable Amount</td><td class="tr">₹${(bill.taxableAmount || subtotal).toLocaleString()}</td></tr>
    ${bill.totalCgst > 0 ? `<tr><td>CGST</td><td class="tr">₹${bill.totalCgst.toLocaleString()}</td></tr>` : ""}
    ${bill.totalSgst > 0 ? `<tr><td>SGST</td><td class="tr">₹${bill.totalSgst.toLocaleString()}</td></tr>` : ""}
    ${bill.totalIgst > 0 ? `<tr><td>IGST</td><td class="tr">₹${bill.totalIgst.toLocaleString()}</td></tr>` : ""}` : "";
  return { subtotal, gstSummary };
}

// ── Style 1: Classic ──────────────────────────────────────────────────────────
function _bodyClassic(bill: any, clinic: ClinicInfo, date: string, items: any[], subtotal: number, balance: number, hasGst: boolean | string | undefined): string {
  const docLabel = hasGst ? "Tax Invoice" : undefined;
  const { gstSummary } = _billMeta(bill, clinic, hasGst);

  const hasBatch = items.some((i: any) => i.batchNo);
  const itemRows = items.map((item, idx) => `
    <tr>
      <td class="tc" style="width:36px;">${idx + 1}</td>
      <td><strong>${item.description}</strong>${item.hsnCode ? `<div style="font-size:10px;color:#888;">HSN: ${item.hsnCode}</div>` : ""}</td>
      <td style="width:90px;">${item.category}</td>
      ${hasBatch ? `<td style="width:96px;font-family:monospace;font-size:11px;">${item.batchNo || "—"}</td>` : ""}
      ${hasBatch ? `<td style="width:76px;font-size:11px;text-align:center;">${item.expiryDate ? new Date(item.expiryDate).toLocaleDateString("en-IN", { month:"short", year:"numeric" }) : "—"}</td>` : ""}
      <td class="tc" style="width:44px;">${item.quantity}</td>
      <td class="tr" style="width:76px;">₹${(item.unitPrice || 0).toLocaleString()}</td>
      ${hasGst ? `<td class="tr" style="width:68px;">${item.taxRate ? `${item.taxRate}%` : "—"}</td>` : ""}
      <td class="tr" style="width:88px;font-weight:600;">₹${(item.total || 0).toLocaleString()}</td>
    </tr>`).join("");

  return `
    ${clinicHeader(clinic, docLabel)}
    <div class="doc-row">
      <div>
        <div class="doc-title">INVOICE / RECEIPT</div>
        <div style="margin-top:4px;"><span class="badge">${bill.type || "OPD"}</span></div>
      </div>
      <div class="doc-id">
        <div style="font-size:16px;font-weight:800;font-family:monospace;">${bill.billId || bill.id || "—"}</div>
        <div>Date: ${date}</div>
        <div style="margin-top:3px;font-size:11px;color:#888;">Status: <strong>${bill.status || "Pending"}</strong></div>
      </div>
    </div>
    <div class="meta">
      <div class="meta-item"><label>Patient Name</label><span>${bill.patientName || "—"}</span></div>
      <div class="meta-item"><label>UHID</label><span>${bill.patientId || "—"}</span></div>
      ${bill.doctor ? `<div class="meta-item"><label>Doctor</label><span>${bill.doctor}</span></div>` : ""}
      <div class="meta-item"><label>Payer</label><span>${bill.payer || "Self"}</span></div>
      <div class="meta-item"><label>Payment Mode</label><span>${bill.paymentMode || "—"}</span></div>
      ${bill.appointmentId ? `<div class="meta-item"><label>Appointment Ref</label><span>${bill.appointmentId}</span></div>` : ""}
    </div>
    <table>
      <thead>
        <tr>
          <th class="tc">#</th><th>Description</th><th>Category</th>
          ${hasBatch ? `<th>Batch No</th>` : ""}
          ${hasBatch ? `<th class="tc">Expiry</th>` : ""}
          <th class="tc">Qty</th>
          <th class="tr">Rate</th>${hasGst ? `<th class="tr">GST%</th>` : ""}<th class="tr">Amount</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
    <div class="summary">
      <table>
        <tr><td>Subtotal</td><td class="tr">₹${subtotal.toLocaleString()}</td></tr>
        ${bill.discount > 0 ? `<tr><td>Discount</td><td class="tr" style="color:#d97706;">−₹${bill.discount.toLocaleString()}</td></tr>` : ""}
        ${gstSummary}
        <tr class="tot-row"><td>Total</td><td class="tr">₹${(bill.amount || 0).toLocaleString()}</td></tr>
        <tr class="paid-row"><td>Amount Paid</td><td class="tr">₹${(bill.paid || 0).toLocaleString()}</td></tr>
        ${balance > 0 ? `<tr class="bal-row"><td>Balance Due</td><td class="tr">₹${balance.toLocaleString()}</td></tr>` : ""}
        ${balance < 0 ? `<tr><td style="color:#15803d;">Overpaid</td><td class="tr" style="color:#15803d;">₹${Math.abs(balance).toLocaleString()}</td></tr>` : ""}
      </table>
    </div>
    ${bill.notes ? `<div class="notes"><strong>Notes</strong>${bill.notes}</div>` : ""}
    <div class="footer">
      <p>Thank you for choosing ${clinic.name}. We wish you a speedy recovery!</p>
      ${clinic.phone ? `<p>For queries call: ${clinic.phone}</p>` : ""}
      ${hasGst ? `<p style="font-size:10px;">Computer-generated Tax Invoice · GSTIN: ${clinic.gstNo}</p>` : ""}
    </div>`;
}

// ── Style 2: Modern ───────────────────────────────────────────────────────────
function _bodyModern(bill: any, clinic: ClinicInfo, date: string, items: any[], subtotal: number, balance: number, hasGst: boolean | string | undefined): string {
  const { gstSummary } = _billMeta(bill, clinic, hasGst);
  const sub = [clinic.phone, clinic.address, clinic.city].filter(Boolean).join("  ·  ");
  const logoHtml = clinic.logoUrl ? `<img src="${clinic.logoUrl}" alt="logo" style="height:40px;width:auto;object-fit:contain;margin-bottom:4px;display:block;" />` : "";

  const hasBatch = items.some((i: any) => i.batchNo);
  const itemRows = items.map((item, idx) => `
    <tr>
      <td style="padding:7px 10px;border-bottom:1px solid #e8f4f2;width:32px;text-align:center;color:#888;">${idx + 1}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e8f4f2;">
        <strong>${item.description}</strong>
        ${item.hsnCode ? `<div style="font-size:10px;color:#888;">HSN: ${item.hsnCode}</div>` : ""}
      </td>
      <td style="padding:7px 10px;border-bottom:1px solid #e8f4f2;color:#555;width:80px;">${item.category}</td>
      ${hasBatch ? `<td style="padding:7px 10px;border-bottom:1px solid #e8f4f2;font-family:monospace;font-size:11px;width:90px;">${item.batchNo || "—"}</td>` : ""}
      ${hasBatch ? `<td style="padding:7px 10px;border-bottom:1px solid #e8f4f2;font-size:11px;text-align:center;width:76px;">${item.expiryDate ? new Date(item.expiryDate).toLocaleDateString("en-IN", { month:"short", year:"numeric" }) : "—"}</td>` : ""}
      <td style="padding:7px 10px;border-bottom:1px solid #e8f4f2;text-align:center;width:40px;">${item.quantity}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e8f4f2;text-align:right;width:80px;">₹${(item.unitPrice || 0).toLocaleString()}</td>
      ${hasGst ? `<td style="padding:7px 10px;border-bottom:1px solid #e8f4f2;text-align:right;width:60px;">${item.taxRate ? `${item.taxRate}%` : "—"}</td>` : ""}
      <td style="padding:7px 10px;border-bottom:1px solid #e8f4f2;text-align:right;width:90px;font-weight:700;color:#1a5c4a;">₹${(item.total || 0).toLocaleString()}</td>
    </tr>`).join("");

  return `
    <div style="margin:-20px -20px 20px;background:#1a5c4a;color:#fff;padding:18px 24px;display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        ${logoHtml}
        <div style="font-size:20px;font-weight:800;letter-spacing:.3px;">${clinic.name}</div>
        ${sub ? `<div style="font-size:10px;opacity:.75;margin-top:3px;">${sub}</div>` : ""}
        ${clinic.gstNo ? `<div style="font-size:10px;opacity:.7;margin-top:2px;">GSTIN: ${clinic.gstNo}</div>` : ""}
      </div>
      <div style="text-align:right;">
        <div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;opacity:.7;">${hasGst ? "Tax Invoice" : "Invoice"}</div>
        <div style="font-size:18px;font-weight:800;font-family:monospace;margin-top:2px;">${bill.billId || bill.id || "—"}</div>
        <div style="font-size:10px;opacity:.75;margin-top:4px;">${date}</div>
        <div style="margin-top:6px;">
          <span style="padding:2px 9px;border-radius:3px;font-size:10px;font-weight:700;background:rgba(255,255,255,.18);letter-spacing:.5px;">${bill.status || "Pending"}</span>
        </div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px 20px;margin-bottom:16px;padding:10px 14px;background:#f0faf7;border:1px solid #c4e8df;border-radius:6px;">
      ${[
        ["Patient", bill.patientName || "—"],
        ["UHID", bill.patientId || "—"],
        ...(bill.doctor ? [["Doctor", bill.doctor]] : []),
        ["Type", bill.type || "OPD"],
        ["Payer", bill.payer || "Self"],
        ["Payment Mode", bill.paymentMode || "—"],
      ].map(([l, v]) => `<div><div style="font-size:9px;color:#4a7c70;text-transform:uppercase;letter-spacing:.4px;">${l}</div><div style="font-size:12px;font-weight:600;">${v}</div></div>`).join("")}
    </div>

    <table style="width:100%;border-collapse:collapse;margin:0 0 12px;">
      <thead>
        <tr style="background:#1a5c4a;">
          <th style="padding:7px 10px;text-align:center;color:#fff;font-size:10px;letter-spacing:.3px;width:32px;">#</th>
          <th style="padding:7px 10px;text-align:left;color:#fff;font-size:10px;letter-spacing:.3px;">Description</th>
          <th style="padding:7px 10px;text-align:left;color:#fff;font-size:10px;letter-spacing:.3px;width:80px;">Category</th>
          ${hasBatch ? `<th style="padding:7px 10px;text-align:left;color:#fff;font-size:10px;letter-spacing:.3px;width:90px;">Batch No</th>` : ""}
          ${hasBatch ? `<th style="padding:7px 10px;text-align:center;color:#fff;font-size:10px;letter-spacing:.3px;width:76px;">Expiry</th>` : ""}
          <th style="padding:7px 10px;text-align:center;color:#fff;font-size:10px;letter-spacing:.3px;width:40px;">Qty</th>
          <th style="padding:7px 10px;text-align:right;color:#fff;font-size:10px;letter-spacing:.3px;width:80px;">Rate</th>
          ${hasGst ? `<th style="padding:7px 10px;text-align:right;color:#fff;font-size:10px;letter-spacing:.3px;width:60px;">GST%</th>` : ""}
          <th style="padding:7px 10px;text-align:right;color:#fff;font-size:10px;letter-spacing:.3px;width:90px;">Amount</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <div style="margin-left:auto;width:280px;border:1px solid #1a5c4a;border-radius:6px;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:6px 12px;font-size:12px;">Subtotal</td><td style="padding:6px 12px;text-align:right;font-size:12px;">₹${subtotal.toLocaleString()}</td></tr>
        ${bill.discount > 0 ? `<tr><td style="padding:6px 12px;font-size:12px;color:#d97706;">Discount</td><td style="padding:6px 12px;text-align:right;font-size:12px;color:#d97706;">−₹${bill.discount.toLocaleString()}</td></tr>` : ""}
        ${gstSummary ? gstSummary.replace(/<tr>/g, '<tr>').replace(/class="tr"/g, 'style="text-align:right;"') : ""}
        <tr style="background:#1a5c4a;"><td style="padding:8px 12px;color:#fff;font-weight:800;font-size:14px;">Total</td><td style="padding:8px 12px;text-align:right;color:#fff;font-weight:800;font-size:14px;">₹${(bill.amount || 0).toLocaleString()}</td></tr>
        <tr><td style="padding:6px 12px;font-size:12px;color:#15803d;font-weight:600;">Paid</td><td style="padding:6px 12px;text-align:right;font-size:12px;color:#15803d;font-weight:600;">₹${(bill.paid || 0).toLocaleString()}</td></tr>
        ${balance > 0 ? `<tr><td style="padding:6px 12px;font-size:12px;color:#dc2626;font-weight:600;">Balance Due</td><td style="padding:6px 12px;text-align:right;font-size:12px;color:#dc2626;font-weight:600;">₹${balance.toLocaleString()}</td></tr>` : ""}
      </table>
    </div>

    ${bill.notes ? `<div style="margin-top:14px;padding:9px 12px;background:#fffbf0;border:1px solid #e5d68a;border-radius:5px;font-size:12px;"><strong style="display:block;margin-bottom:3px;color:#92400e;">Notes</strong>${bill.notes}</div>` : ""}

    <div style="margin-top:22px;padding-top:10px;border-top:2px solid #1a5c4a;text-align:center;font-size:11px;color:#555;">
      <p>Thank you for choosing <strong>${clinic.name}</strong>. We wish you a speedy recovery!</p>
      ${clinic.phone ? `<p>For queries: ${clinic.phone}</p>` : ""}
    </div>`;
}

// ── Style 3: Minimal ──────────────────────────────────────────────────────────
function _bodyMinimal(bill: any, clinic: ClinicInfo, date: string, items: any[], subtotal: number, balance: number, hasGst: boolean | string | undefined): string {
  const { gstSummary } = _billMeta(bill, clinic, hasGst);
  const sub = [clinic.phone, clinic.address, clinic.city].filter(Boolean).join("  ·  ");
  const logoHtml = clinic.logoUrl ? `<img src="${clinic.logoUrl}" alt="logo" style="height:44px;width:auto;object-fit:contain;margin-bottom:6px;display:block;" />` : "";

  const hasBatch = items.some((i: any) => i.batchNo);
  const itemRows = items.map((item, idx) => `
    <tr>
      <td style="padding:8px 4px;border-bottom:1px solid #f0f0f0;color:#aaa;width:28px;font-size:11px;">${idx + 1}</td>
      <td style="padding:8px 8px;border-bottom:1px solid #f0f0f0;">
        <span style="font-weight:600;">${item.description}</span>
      </td>
      <td style="padding:8px 8px;border-bottom:1px solid #f0f0f0;color:#888;font-size:11px;width:80px;">${item.category}</td>
      ${hasBatch ? `<td style="padding:8px 8px;border-bottom:1px solid #f0f0f0;font-family:monospace;font-size:11px;width:90px;">${item.batchNo || "—"}</td>` : ""}
      ${hasBatch ? `<td style="padding:8px 8px;border-bottom:1px solid #f0f0f0;font-size:11px;text-align:center;width:76px;">${item.expiryDate ? new Date(item.expiryDate).toLocaleDateString("en-IN", { month:"short", year:"numeric" }) : "—"}</td>` : ""}
      <td style="padding:8px 8px;border-bottom:1px solid #f0f0f0;text-align:center;width:36px;font-size:12px;">${item.quantity}</td>
      <td style="padding:8px 8px;border-bottom:1px solid #f0f0f0;text-align:right;width:80px;color:#555;">₹${(item.unitPrice || 0).toLocaleString()}</td>
      ${hasGst ? `<td style="padding:8px 8px;border-bottom:1px solid #f0f0f0;text-align:right;width:56px;color:#888;font-size:11px;">${item.taxRate ? `${item.taxRate}%` : "—"}</td>` : ""}
      <td style="padding:8px 8px;border-bottom:1px solid #f0f0f0;text-align:right;width:90px;font-weight:700;">₹${(item.total || 0).toLocaleString()}</td>
    </tr>`).join("");

  return `
    <div style="padding-bottom:14px;margin-bottom:18px;border-bottom:2px solid #111;">
      ${logoHtml}
      <div style="font-size:26px;font-weight:800;letter-spacing:-0.5px;line-height:1;">${clinic.name}</div>
      ${sub ? `<div style="font-size:11px;color:#888;margin-top:4px;">${sub}</div>` : ""}
      ${clinic.gstNo ? `<div style="font-size:11px;color:#555;margin-top:2px;font-weight:600;">GSTIN: ${clinic.gstNo}</div>` : ""}
    </div>

    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
      <div>
        <div style="font-size:11px;color:#aaa;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">${hasGst ? "Tax Invoice" : "Invoice"}</div>
        <div style="font-size:30px;font-weight:800;font-family:monospace;letter-spacing:-1px;line-height:1;margin-top:3px;">${bill.billId || bill.id || "—"}</div>
        <div style="margin-top:6px;"><span style="padding:2px 8px;border-radius:3px;font-size:11px;font-weight:600;background:#f0f0f0;color:#444;">${bill.type || "OPD"}</span></div>
      </div>
      <div style="text-align:right;font-size:12px;color:#555;line-height:1.7;">
        <div>${date}</div>
        <div style="font-weight:600;color:#111;">${bill.patientName || "—"}</div>
        <div style="font-size:11px;color:#888;">UHID: ${bill.patientId || "—"}</div>
        ${bill.doctor ? `<div style="font-size:11px;color:#888;">Dr. ${bill.doctor}</div>` : ""}
        <div style="font-size:11px;">${bill.paymentMode || ""} · ${bill.payer || "Self"}</div>
      </div>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <thead>
        <tr style="border-bottom:2px solid #111;">
          <th style="padding:6px 4px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#888;width:28px;">#</th>
          <th style="padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#888;">Description</th>
          <th style="padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#888;width:80px;">Category</th>
          ${hasBatch ? `<th style="padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#888;width:90px;">Batch No</th>` : ""}
          ${hasBatch ? `<th style="padding:6px 8px;text-align:center;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#888;width:76px;">Expiry</th>` : ""}
          <th style="padding:6px 8px;text-align:center;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#888;width:36px;">Qty</th>
          <th style="padding:6px 8px;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#888;width:80px;">Rate</th>
          ${hasGst ? `<th style="padding:6px 8px;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#888;width:56px;">GST%</th>` : ""}
          <th style="padding:6px 8px;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#888;width:90px;">Amount</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <div style="display:flex;justify-content:flex-end;margin-bottom:16px;">
      <div style="min-width:240px;font-size:13px;">
        <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f0f0f0;color:#555;">
          <span>Subtotal</span><span>₹${subtotal.toLocaleString()}</span>
        </div>
        ${bill.discount > 0 ? `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f0f0f0;color:#d97706;"><span>Discount</span><span>−₹${bill.discount.toLocaleString()}</span></div>` : ""}
        ${hasGst && bill.totalCgst > 0 ? `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f0f0f0;color:#555;"><span>CGST</span><span>₹${bill.totalCgst.toLocaleString()}</span></div>` : ""}
        ${hasGst && bill.totalSgst > 0 ? `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f0f0f0;color:#555;"><span>SGST</span><span>₹${bill.totalSgst.toLocaleString()}</span></div>` : ""}
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:2px solid #111;margin-top:2px;font-size:16px;font-weight:800;">
          <span>Total</span><span>₹${(bill.amount || 0).toLocaleString()}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:5px 0;color:#15803d;font-weight:600;">
          <span>Paid</span><span>₹${(bill.paid || 0).toLocaleString()}</span>
        </div>
        ${balance > 0 ? `<div style="display:flex;justify-content:space-between;padding:5px 0;color:#dc2626;font-weight:600;"><span>Balance Due</span><span>₹${balance.toLocaleString()}</span></div>` : ""}
      </div>
    </div>

    ${bill.notes ? `<div style="margin-top:8px;font-size:12px;color:#555;font-style:italic;border-left:3px solid #ddd;padding-left:10px;">${bill.notes}</div>` : ""}

    <div style="margin-top:32px;padding-top:10px;border-top:1px solid #eee;font-size:11px;color:#aaa;text-align:center;">
      ${clinic.name}${clinic.phone ? ` · ${clinic.phone}` : ""}
      ${hasGst ? `<div style="margin-top:3px;font-size:10px;">GSTIN: ${clinic.gstNo}</div>` : ""}
    </div>`;
}

// ── Style 4: Thermal / Slip (A5) ──────────────────────────────────────────────
function _bodyThermal(bill: any, clinic: ClinicInfo, date: string, items: any[], subtotal: number, balance: number): string {
  const sub = [clinic.phone, clinic.address].filter(Boolean).join(" · ");
  const logoHtml = clinic.logoUrl ? `<img src="${clinic.logoUrl}" alt="logo" style="height:36px;width:auto;object-fit:contain;display:block;margin:0 auto 4px;" />` : "";

  const itemLines = items.map((item) => `
    <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
      <span style="flex:1;margin-right:8px;">
        ${item.description}${item.quantity > 1 ? ` <span style="color:#888;">×${item.quantity}</span>` : ""}
        ${item.batchNo ? `<div style="font-size:9px;color:#aaa;">Batch: ${item.batchNo}${item.expiryDate ? ` · Exp: ${new Date(item.expiryDate).toLocaleDateString("en-IN", { month:"short", year:"numeric" })}` : ""}</div>` : ""}
      </span>
      <span style="font-weight:700;white-space:nowrap;">₹${(item.total || 0).toLocaleString()}</span>
    </div>`).join("");

  return `
    <div style="text-align:center;margin-bottom:10px;">
      ${logoHtml}
      <div style="font-size:16px;font-weight:800;letter-spacing:.3px;">${clinic.name}</div>
      ${sub ? `<div style="font-size:9px;color:#666;margin-top:2px;">${sub}</div>` : ""}
      <div style="margin-top:8px;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">${bill.type || "OPD"} RECEIPT</div>
    </div>

    <div style="border-top:1px dashed #333;border-bottom:1px dashed #333;padding:6px 0;margin-bottom:8px;font-size:10px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
        <span style="color:#888;">Bill No</span>
        <span style="font-weight:700;font-family:monospace;">${bill.billId || bill.id || "—"}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
        <span style="color:#888;">Date</span><span>${date}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
        <span style="color:#888;">Patient</span>
        <span style="font-weight:600;">${bill.patientName || "—"}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
        <span style="color:#888;">UHID</span><span>${bill.patientId || "—"}</span>
      </div>
      ${bill.doctor ? `<div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="color:#888;">Doctor</span><span>Dr. ${bill.doctor}</span></div>` : ""}
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#888;">Payment</span><span>${bill.paymentMode || "Cash"} · ${bill.payer || "Self"}</span>
      </div>
    </div>

    <div style="font-size:11px;margin-bottom:8px;">
      ${itemLines}
    </div>

    <div style="border-top:1px dashed #333;padding-top:7px;font-size:11px;">
      ${bill.discount > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:3px;color:#d97706;"><span>Discount</span><span>−₹${bill.discount.toLocaleString()}</span></div>` : ""}
      <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:800;padding-bottom:5px;border-bottom:1px dashed #333;margin-bottom:5px;">
        <span>TOTAL</span><span>₹${(bill.amount || 0).toLocaleString()}</span>
      </div>
      <div style="display:flex;justify-content:space-between;color:#15803d;font-weight:600;margin-bottom:3px;">
        <span>Paid</span><span>₹${(bill.paid || 0).toLocaleString()}</span>
      </div>
      ${balance > 0 ? `<div style="display:flex;justify-content:space-between;color:#dc2626;font-weight:600;"><span>Balance Due</span><span>₹${balance.toLocaleString()}</span></div>` : ""}
      ${balance === 0 ? `<div style="text-align:center;margin-top:4px;font-weight:700;color:#15803d;font-size:12px;">✓ PAID IN FULL</div>` : ""}
    </div>

    ${bill.notes ? `<div style="margin-top:8px;font-size:10px;color:#666;border-top:1px dashed #ccc;padding-top:6px;">${bill.notes}</div>` : ""}

    <div style="margin-top:12px;padding-top:8px;border-top:2px dashed #333;text-align:center;font-size:10px;color:#777;">
      <div style="font-weight:700;margin-bottom:2px;">Thank you for visiting ${clinic.name}!</div>
      ${clinic.phone ? `<div>${clinic.phone}</div>` : ""}
      <div style="margin-top:4px;font-size:9px;color:#aaa;">Status: ${bill.status || "—"}</div>
    </div>`;
}

// ── Style 5: Compact (A5) ─────────────────────────────────────────────────────
function _bodyCompact(bill: any, clinic: ClinicInfo, date: string, items: any[], subtotal: number, balance: number, hasGst: boolean | string | undefined): string {
  const { gstSummary } = _billMeta(bill, clinic, hasGst);
  const sub = [clinic.phone, clinic.address, clinic.city].filter(Boolean).join(" · ");
  const logoHtml = clinic.logoUrl ? `<img src="${clinic.logoUrl}" alt="logo" style="height:32px;width:auto;object-fit:contain;" />` : "";

  const hasBatch = items.some((i: any) => i.batchNo);
  const itemRows = items.map((item, idx) => `
    <tr>
      <td style="padding:5px 6px;border:1px solid #e0e0e0;font-size:10px;color:#888;width:24px;text-align:center;">${idx + 1}</td>
      <td style="padding:5px 6px;border:1px solid #e0e0e0;font-size:10px;font-weight:600;">${item.description}</td>
      ${hasBatch ? `<td style="padding:5px 6px;border:1px solid #e0e0e0;font-size:9px;font-family:monospace;width:84px;">${item.batchNo || "—"}</td>` : ""}
      ${hasBatch ? `<td style="padding:5px 6px;border:1px solid #e0e0e0;font-size:9px;text-align:center;width:68px;">${item.expiryDate ? new Date(item.expiryDate).toLocaleDateString("en-IN", { month:"short", year:"numeric" }) : "—"}</td>` : ""}
      <td style="padding:5px 6px;border:1px solid #e0e0e0;font-size:10px;text-align:center;width:30px;">${item.quantity}</td>
      <td style="padding:5px 6px;border:1px solid #e0e0e0;font-size:10px;text-align:right;width:70px;">₹${(item.unitPrice || 0).toLocaleString()}</td>
      <td style="padding:5px 6px;border:1px solid #e0e0e0;font-size:10px;text-align:right;width:70px;font-weight:700;">₹${(item.total || 0).toLocaleString()}</td>
    </tr>`).join("");

  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:12px;">
      <div>
        ${logoHtml}
        <div style="font-size:15px;font-weight:800;margin-top:${clinic.logoUrl ? "4px" : "0"};">${clinic.name}</div>
        ${sub ? `<div style="font-size:9px;color:#777;margin-top:2px;">${sub}</div>` : ""}
        ${clinic.gstNo ? `<div style="font-size:9px;color:#555;font-weight:600;margin-top:1px;">GSTIN: ${clinic.gstNo}</div>` : ""}
      </div>
      <div style="text-align:right;">
        <div style="font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.5px;">${hasGst ? "Tax Invoice" : "Invoice"}</div>
        <div style="font-size:15px;font-weight:800;font-family:monospace;">${bill.billId || bill.id || "—"}</div>
        <div style="font-size:10px;color:#555;margin-top:2px;">${date}</div>
        <span style="display:inline-block;margin-top:4px;padding:1px 7px;border-radius:3px;font-size:9px;font-weight:700;background:#e8f5f3;color:#1a6b5e;border:1px solid #aed7d1;">${bill.status || "Pending"}</span>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 14px;margin-bottom:12px;font-size:10px;">
      <div><span style="color:#888;">Patient: </span><strong>${bill.patientName || "—"}</strong></div>
      <div><span style="color:#888;">UHID: </span>${bill.patientId || "—"}</div>
      ${bill.doctor ? `<div><span style="color:#888;">Doctor: </span>${bill.doctor}</div>` : ""}
      <div><span style="color:#888;">Type: </span>${bill.type || "OPD"}</div>
      <div><span style="color:#888;">Mode: </span>${bill.paymentMode || "—"}</div>
      <div><span style="color:#888;">Payer: </span>${bill.payer || "Self"}</div>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:10px;">
      <thead>
        <tr style="background:#f0f0f0;">
          <th style="padding:5px 6px;border:1px solid #ccc;font-size:9px;text-transform:uppercase;text-align:center;width:24px;">#</th>
          <th style="padding:5px 6px;border:1px solid #ccc;font-size:9px;text-transform:uppercase;text-align:left;">Description</th>
          ${hasBatch ? `<th style="padding:5px 6px;border:1px solid #ccc;font-size:9px;text-transform:uppercase;text-align:left;width:84px;">Batch No</th>` : ""}
          ${hasBatch ? `<th style="padding:5px 6px;border:1px solid #ccc;font-size:9px;text-transform:uppercase;text-align:center;width:68px;">Expiry</th>` : ""}
          <th style="padding:5px 6px;border:1px solid #ccc;font-size:9px;text-transform:uppercase;text-align:center;width:30px;">Qty</th>
          <th style="padding:5px 6px;border:1px solid #ccc;font-size:9px;text-transform:uppercase;text-align:right;width:70px;">Rate</th>
          <th style="padding:5px 6px;border:1px solid #ccc;font-size:9px;text-transform:uppercase;text-align:right;width:70px;">Amount</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <div style="margin-left:auto;width:200px;font-size:10px;">
      <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #eee;"><span>Subtotal</span><span>₹${subtotal.toLocaleString()}</span></div>
      ${bill.discount > 0 ? `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #eee;color:#d97706;"><span>Discount</span><span>−₹${bill.discount.toLocaleString()}</span></div>` : ""}
      ${hasGst && bill.totalCgst > 0 ? `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #eee;"><span>CGST</span><span>₹${bill.totalCgst.toLocaleString()}</span></div>` : ""}
      ${hasGst && bill.totalSgst > 0 ? `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #eee;"><span>SGST</span><span>₹${bill.totalSgst.toLocaleString()}</span></div>` : ""}
      <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:13px;font-weight:800;border-top:2px solid #111;"><span>Total</span><span>₹${(bill.amount || 0).toLocaleString()}</span></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0;color:#15803d;font-weight:600;"><span>Paid</span><span>₹${(bill.paid || 0).toLocaleString()}</span></div>
      ${balance > 0 ? `<div style="display:flex;justify-content:space-between;padding:3px 0;color:#dc2626;font-weight:600;"><span>Balance</span><span>₹${balance.toLocaleString()}</span></div>` : ""}
    </div>

    ${bill.notes ? `<div style="margin-top:10px;font-size:10px;color:#666;padding:6px 8px;border-left:3px solid #ddd;">${bill.notes}</div>` : ""}

    <div style="margin-top:14px;padding-top:8px;border-top:1px solid #ddd;text-align:center;font-size:9px;color:#aaa;">
      ${clinic.name}${clinic.phone ? ` · ${clinic.phone}` : ""}
    </div>`;
}

// ── printBill — dispatches to style-specific builder ──────────────────────────
export function printBill(bill: any, clinicOverride?: ClinicInfo) {
  const clinic   = clinicOverride ?? getStoredClinic();
  const style    = clinic.invoiceStyle || "classic";
  const date     = bill.createdAt ? new Date(bill.createdAt).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" }) : "—";
  const items    = (bill.items || []) as any[];
  const subtotal = items.reduce((s: number, i: any) => s + (i.total || 0), 0);
  const balance  = (bill.amount || 0) - (bill.paid || 0);
  const hasGst   = clinic.gstNo && (bill.totalCgst > 0 || bill.totalSgst > 0 || bill.totalIgst > 0);
  const title    = `Invoice ${bill.billId || bill.id}`;

  if (style === "modern") {
    open(title, _bodyModern(bill, clinic, date, items, subtotal, balance, hasGst));
  } else if (style === "minimal") {
    open(title, _bodyMinimal(bill, clinic, date, items, subtotal, balance, hasGst));
  } else if (style === "thermal") {
    openA5(title, _bodyThermal(bill, clinic, date, items, subtotal, balance));
  } else if (style === "compact") {
    openA5(title, _bodyCompact(bill, clinic, date, items, subtotal, balance, hasGst));
  } else {
    open(title, _bodyClassic(bill, clinic, date, items, subtotal, balance, hasGst));
  }
}

// ── printDispenseSlip ─────────────────────────────────────────────────────────
export function printDispenseSlip(order: any, clinicOverride?: ClinicInfo) {
  const clinic = clinicOverride ?? getStoredClinic();
  const date   = order.dispensedAt
    ? new Date(order.dispensedAt).toLocaleString("en-IN", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" })
    : new Date().toLocaleString("en-IN");

  const items = (order.items || []) as any[];
  const total = items.reduce((s: number, i: any) => s + ((i.quantity || 1) * (i.mrpPerUnit || 0)), 0);

  const itemRows = items.map((item: any, idx: number) => `
    <tr>
      <td class="tc">${idx + 1}</td>
      <td><strong>${item.drugName || "—"}</strong></td>
      <td class="tc">${item.batchNo || "—"}</td>
      <td class="tc">${item.expiryDate ? new Date(item.expiryDate).toLocaleDateString("en-IN", { month:"short", year:"numeric" }) : "—"}</td>
      <td class="tc">${item.quantity || 1}</td>
      <td class="tr">₹${(item.mrpPerUnit || 0).toLocaleString()}</td>
      <td class="tr"><strong>₹${((item.quantity || 1) * (item.mrpPerUnit || 0)).toLocaleString()}</strong></td>
    </tr>`).join("");

  const body = `
    ${clinicHeader(clinic)}

    <div class="doc-row">
      <div>
        <div class="doc-title">DISPENSE SLIP</div>
        <div style="margin-top:4px;"><span class="badge">${order.type || "OPD"}</span>
        ${order.rxSource === "Paper" ? `<span class="badge" style="margin-left:4px;background:#fff8e1;color:#7c5c00;border-color:#f0c040;">Paper Rx</span>` : ""}
        ${order.rxSource === "OTC"   ? `<span class="badge" style="margin-left:4px;background:#e8f0fe;color:#1a3c8e;border-color:#aec3d7;">OTC</span>`   : ""}
        </div>
      </div>
      <div class="doc-id">
        <div style="font-size:16px;font-weight:800;font-family:monospace;">${order.rxId || "—"}</div>
        <div>Dispensed: ${date}</div>
      </div>
    </div>

    <div class="meta">
      <div class="meta-item"><label>Patient Name</label><span>${order.patientName || "—"}</span></div>
      <div class="meta-item"><label>UHID</label><span>${order.patientId || "—"}</span></div>
      ${order.doctor ? `<div class="meta-item"><label>Doctor</label><span>${order.doctor}</span></div>` : ""}
      <div class="meta-item"><label>Dispensed By</label><span>${order.dispensedBy || "—"}</span></div>
      ${order.paperRxNote ? `<div class="meta-item" style="grid-column:1/-1"><label>Rx Note</label><span>${order.paperRxNote}</span></div>` : ""}
    </div>

    <table>
      <thead>
        <tr>
          <th class="tc">#</th>
          <th>Drug Name</th>
          <th class="tc">Batch No</th>
          <th class="tc">Expiry</th>
          <th class="tc">Qty</th>
          <th class="tr">MRP/Unit</th>
          <th class="tr">Total MRP</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <div class="summary">
      <table>
        <tr class="tot-row"><td>Total MRP</td><td class="tr">₹${total.toLocaleString()}</td></tr>
      </table>
    </div>

    <div class="notes" style="margin-top:14px;">
      <strong>Important</strong>
      Please keep this slip as proof of dispensing. Store medicines as per label instructions.
    </div>

    <div class="footer">
      <p>${clinic.name} — Pharmacy Dispense Slip &nbsp;·&nbsp; ${date}</p>
      ${clinic.phone ? `<p>${clinic.phone}</p>` : ""}
    </div>`;

  open(`Dispense Slip — ${order.rxId || order.patientName || ""}`, body);
}

// ── printPrescription ─────────────────────────────────────────────────────────
export function printPrescription(rx: any, clinicOverride?: ClinicInfo) {
  const clinic = clinicOverride ?? getStoredClinic();
  const date  = rx.date || rx.createdAt
    ? new Date(rx.date || rx.createdAt).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" })
    : new Date().toLocaleDateString("en-IN");

  const drugs = ((rx.items || []) as any[]).map((item, i) => `
    <div class="drug">
      <div class="d-name">${i + 1}. ${item.drug}</div>
      <div class="d-detail">
        Dose: <strong>${item.dose}</strong> &nbsp;·&nbsp;
        Route: <strong>${item.route}</strong> &nbsp;·&nbsp;
        Frequency: <strong>${item.frequency}</strong> &nbsp;·&nbsp;
        Duration: <strong>${item.duration}</strong> &nbsp;·&nbsp;
        Qty: <strong>${item.quantity}</strong>
      </div>
      ${item.instructions ? `<div class="d-note">Instructions: ${item.instructions}</div>` : ""}
    </div>`).join("");

  const body = `
    ${clinicHeader(clinic)}

    <div class="doc-row">
      <div>
        <div class="doc-title" style="font-size:20px;">&#8478; PRESCRIPTION</div>
        <div style="margin-top:4px;"><span class="badge">${rx.type || "OPD"}</span></div>
      </div>
      <div class="doc-id">
        <div style="font-size:14px;font-weight:700;font-family:monospace;">${rx.rxId || ""}</div>
        <div>Date: ${date}</div>
      </div>
    </div>

    <div class="meta">
      <div class="meta-item"><label>Patient Name</label><span>${rx.patientName || "—"}</span></div>
      <div class="meta-item"><label>Prescribed By</label><span>${rx.prescribedBy || "—"}</span></div>
      ${rx.patientId ? `<div class="meta-item"><label>UHID</label><span>${rx.patientId}</span></div>` : ""}
    </div>

    <div style="margin-bottom:10px;font-size:12px;font-style:italic;color:#555;">
      The medicines listed below have been prescribed after clinical examination.
      Please follow dosage instructions carefully.
    </div>

    ${drugs}

    ${rx.notes ? `<div class="notes"><strong>Doctor's Notes</strong>${rx.notes}</div>` : ""}

    <div class="sig-wrap">
      <div class="sig">Doctor's Signature &amp; Stamp</div>
    </div>

    <div class="footer">
      <p>Valid for 30 days from date of issue &nbsp;·&nbsp; Dispensed at ${clinic.name} Pharmacy</p>
      ${clinic.phone ? `<p>For emergencies: ${clinic.phone}</p>` : ""}
    </div>`;

  open(`Prescription ${rx.rxId || ""}`, body);
}

// ── printDischargeReport ──────────────────────────────────────────────────────
export function printDischargeReport(admission: any, clinicOverride?: ClinicInfo) {
  const clinic = clinicOverride ?? getStoredClinic();
  const admitDate    = admission.admissionDate
    ? new Date(admission.admissionDate).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" })
    : "—";
  const dischargeDate = admission.dischargeDate
    ? new Date(admission.dischargeDate).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" })
    : new Date().toLocaleDateString("en-IN");

  const rounds = ((admission.rounds || []) as any[])
    .slice(-5)
    .map((r: any) => `
      <tr>
        <td>${r.date ? new Date(r.date).toLocaleDateString("en-IN") : "—"}</td>
        <td>${r.notes || "—"}</td>
        <td>${r.vitals?.bp || "—"}</td>
        <td>${r.vitals?.spo2 || "—"}</td>
        <td>${r.doctor || admission.primaryDoctor || "—"}</td>
      </tr>`).join("") || `<tr><td colspan="5" style="text-align:center;color:#888;">No rounds recorded</td></tr>`;

  const body = `
    ${clinicHeader(clinic)}

    <div class="doc-row">
      <div>
        <div class="doc-title">DISCHARGE SUMMARY</div>
        <div style="margin-top:4px;"><span class="badge">IPD</span></div>
      </div>
      <div class="doc-id">
        <div style="font-size:14px;font-weight:700;font-family:monospace;">${admission.admissionId || admission._id?.slice(-6) || "—"}</div>
        <div>Admitted: ${admitDate}</div>
        <div>Discharged: ${dischargeDate}</div>
      </div>
    </div>

    <div class="meta">
      <div class="meta-item"><label>Patient Name</label><span>${admission.patientName || "—"}</span></div>
      <div class="meta-item"><label>UHID</label><span>${admission.patientId || "—"}</span></div>
      <div class="meta-item"><label>Ward / Room</label><span>${admission.ward || "—"} — Bed ${admission.bedNumber || "—"}</span></div>
      <div class="meta-item"><label>Primary Doctor</label><span>${admission.primaryDoctor || "—"}</span></div>
      <div class="meta-item"><label>Diagnosis</label><span>${admission.diagnosis || "—"}</span></div>
      <div class="meta-item"><label>Discharge Condition</label><span>${admission.dischargeCondition || admission.condition || "Stable"}</span></div>
    </div>

    ${admission.diagnosis ? `
    <div style="margin-bottom:12px;">
      <div style="font-weight:700;font-size:13px;margin-bottom:5px;border-bottom:1px solid #ddd;padding-bottom:3px;">Diagnosis &amp; Treatment Summary</div>
      <div style="font-size:12px;line-height:1.7;">${admission.diagnosis}</div>
    </div>` : ""}

    <div style="font-weight:700;font-size:13px;margin-bottom:5px;border-bottom:1px solid #ddd;padding-bottom:3px;">Clinical Notes (last 5 rounds)</div>
    <table>
      <thead>
        <tr>
          <th style="width:90px;">Date</th>
          <th>Notes</th>
          <th style="width:60px;">BP</th>
          <th style="width:60px;">SpO₂</th>
          <th style="width:110px;">Doctor</th>
        </tr>
      </thead>
      <tbody>${rounds}</tbody>
    </table>

    ${admission.dischargeInstructions ? `
    <div class="notes" style="margin-top:14px;"><strong>Discharge Instructions</strong>${admission.dischargeInstructions}</div>` : ""}

    ${admission.followUpDate ? `
    <div style="margin-top:12px;padding:8px 12px;background:#e8f5e9;border:1px solid #a5d6a7;border-radius:5px;font-size:12px;">
      <strong>Follow-up Appointment:</strong> ${new Date(admission.followUpDate).toLocaleDateString("en-IN")}
    </div>` : ""}

    <div class="sig-wrap" style="margin-top:30px;justify-content:space-between;">
      <div class="sig" style="width:200px;">Patient / Attendant Signature</div>
      <div class="sig" style="width:200px;">Treating Doctor Signature</div>
    </div>

    <div class="footer">
      <p>${clinic.name} — Discharge Summary</p>
      ${clinic.phone ? `<p>For medical queries: ${clinic.phone}</p>` : ""}
    </div>`;

  open(`Discharge Summary — ${admission.patientName || ""}`, body);
}

// ── printLabReport ────────────────────────────────────────────────────────────

function buildParamTable(testName: string, rows: { name: string; value: string; unit: string; referenceRange: string }[]): string {
  const rowHtml = rows.map((p) => `
    <tr>
      <td>${p.name}</td>
      <td class="val-cell">${p.value || "—"}</td>
      <td>${p.unit || ""}</td>
      <td class="ref-cell">${p.referenceRange || ""}</td>
    </tr>`).join("");
  return `
  <div class="param-section">
    <div class="test-name">${testName}</div>
    <table class="param-table">
      <thead>
        <tr>
          <th style="width:40%;">Parameter</th>
          <th style="width:18%;">Result</th>
          <th style="width:14%;">Unit</th>
          <th>Reference Range</th>
        </tr>
      </thead>
      <tbody>${rowHtml}</tbody>
    </table>
  </div>`;
}

function parseResultTextToTables(resultText: string, testNames: string[]): string {
  // Parse "Name: value unit, Name: value unit, ..." into rows
  const entries = resultText.split(/,\s+/).map((entry) => {
    const idx = entry.indexOf(": ");
    if (idx === -1) return null;
    const name  = entry.slice(0, idx).trim();
    const rest  = entry.slice(idx + 2).trim();
    return { name, rawValue: rest };
  }).filter(Boolean) as { name: string; rawValue: string }[];

  if (entries.length === 0) return `<div class="notes"><strong>Result</strong>${resultText}</div>`;

  // Build a reverse lookup: paramName → { testName, unit, referenceRange }
  const lookup: Record<string, { testName: string; unit: string; referenceRange: string }> = {};
  for (const test of testNames) {
    const params = LAB_TEST_MASTER[test] ?? [];
    for (const p of params) {
      lookup[p.name] = { testName: test, unit: p.unit, referenceRange: p.referenceRange };
    }
  }

  // Group entries by test name, using lookup when available
  const byTest: Record<string, { name: string; value: string; unit: string; referenceRange: string }[]> = {};
  const fallbackTest = testNames[0] || "Result";

  for (const entry of entries) {
    const meta  = lookup[entry.name];
    const tName = meta?.testName ?? fallbackTest;

    // Separate value from unit if unit is embedded in rawValue
    let value = entry.rawValue;
    let unit  = meta?.unit ?? "";
    if (unit && entry.rawValue.endsWith(unit)) {
      value = entry.rawValue.slice(0, -unit.length).trim();
    }

    if (!byTest[tName]) byTest[tName] = [];
    byTest[tName].push({ name: entry.name, value, unit, referenceRange: meta?.referenceRange ?? "" });
  }

  // Any entries not matched to a known test go under fallback
  return Object.entries(byTest).map(([t, rows]) => buildParamTable(t, rows)).join("");
}

export function printLabReport(order: any, clinicOverride?: ClinicInfo) {
  const clinic = clinicOverride ?? getStoredClinic();

  const orderedDate = order.ordered
    ? new Date(order.ordered).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" })
    : "—";
  const sampleDate = order.sampleDate
    ? new Date(order.sampleDate).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" })
    : orderedDate;

  const parameters: any[] = order.parameters || [];
  const testNames: string[] = (order.test || "").split(",").map((t: string) => t.trim()).filter(Boolean);

  let resultBlock: string;

  if (parameters.length > 0) {
    // ── Structured parameters saved by new UI ──────────────────────────────
    const byTest: Record<string, any[]> = {};
    for (const p of parameters) {
      const key = p.testName || testNames[0] || "Result";
      if (!byTest[key]) byTest[key] = [];
      byTest[key].push(p);
    }
    resultBlock = Object.entries(byTest)
      .map(([testName, rows]) =>
        buildParamTable(testName, rows.map((p) => ({
          name: p.name, value: p.value || "—", unit: p.unit || "", referenceRange: p.referenceRange || "",
        })))
      ).join("");
  } else if (order.result && order.result.trim()) {
    // ── Plain-text result — parse into tables ──────────────────────────────
    resultBlock = parseResultTextToTables(order.result.trim(), testNames);
  } else {
    resultBlock = `<div style="color:#999;font-style:italic;padding:12px 0;">No result recorded yet.</div>`;
  }

  const body = `
    ${clinicHeader(clinic)}

    <div class="doc-row">
      <div>
        <div class="doc-title">LAB REPORT</div>
        <div style="margin-top:4px;">
          <span class="badge" style="background:#e8f0ff;color:#1a3c8e;border-color:#aec3d7;">${order.priority || "Routine"}</span>
        </div>
      </div>
      <div class="doc-id">
        <div style="font-size:16px;font-weight:800;font-family:monospace;">${order.labId || order._id?.slice(-6) || "—"}</div>
        <div>Ordered: ${orderedDate}</div>
        <div>Sample Date: <strong>${sampleDate}</strong></div>
        <div style="margin-top:3px;">Status: <strong style="color:#15803d;">${order.status || "—"}</strong></div>
      </div>
    </div>

    <div class="meta">
      <div class="meta-item"><label>Patient Name</label><span>${order.patientName || "—"}</span></div>
      <div class="meta-item"><label>Patient ID</label><span>${order.patientId || "—"}</span></div>
      <div class="meta-item"><label>Ordered By</label><span>Dr. ${order.doctor || "—"}</span></div>
      ${order.reportedBy ? `<div class="meta-item"><label>Reported By</label><span>${order.reportedBy}</span></div>` : ""}
      <div class="meta-item"><label>Test(s)</label><span>${order.test || "—"}</span></div>
      ${order.notes ? `<div class="meta-item" style="grid-column:1/-1"><label>Clinical Notes</label><span>${order.notes}</span></div>` : ""}
    </div>

    ${resultBlock}

    <div class="sig-wrap" style="margin-top:30px;justify-content:space-between;">
      <div class="sig" style="width:200px;">Lab Technician Signature</div>
      <div class="sig" style="width:200px;">Pathologist / Doctor Signature</div>
    </div>

    <div class="footer">
      <p>${clinic.name} — Lab Report &nbsp;·&nbsp; Lab ID: ${order.labId || "—"}</p>
      <p>This is a computer-generated report. Results should be correlated with clinical findings.</p>
      ${clinic.phone ? `<p>${clinic.phone}</p>` : ""}
    </div>`;

  open(`Lab Report — ${order.labId || order.patientName || ""}`, body);
}

// ── printCurrentStockReport ───────────────────────────────────────────────────
export function printCurrentStockReport(drugs: any[], filter: string, clinicOverride?: ClinicInfo) {
  const clinic = clinicOverride ?? getStoredClinic();
  const generatedAt = new Date().toLocaleString("en-IN", { dateStyle: "long", timeStyle: "short" } as any);
  const filterLabel = filter === "All" ? "All Items" : filter;

  const totalItems = drugs.length;
  const criticalCount = drugs.filter((d) => d.status === "Critical").length;
  const lowCount      = drugs.filter((d) => d.status === "Low").length;
  const okCount       = drugs.filter((d) => d.status === "OK").length;

  const rowHtml = drugs.map((d, i) => {
    const statusColor =
      d.status === "Critical" ? "background:#fff0f0;" :
      d.status === "Low"      ? "background:#fffbeb;" : "";
    return `
    <tr style="${statusColor}">
      <td class="tc">${i + 1}</td>
      <td><strong>${d.name || "—"}</strong></td>
      <td>${d.category || "—"}</td>
      <td class="tr"><strong>${d.stock}</strong> ${d.unit}</td>
      <td class="tr">${d.reorderLevel} ${d.unit}</td>
      <td class="tr">${d.mrpPerUnit ? `₹${Number(d.mrpPerUnit).toLocaleString("en-IN")}` : "—"}</td>
      <td class="tc"><strong style="color:${d.status === "Critical" ? "#dc2626" : d.status === "Low" ? "#d97706" : "#15803d"};">${d.status}</strong></td>
    </tr>`;
  }).join("");

  const summaryBadges = `
  <div style="display:flex;gap:12px;margin-bottom:14px;flex-wrap:wrap;">
    <span style="padding:4px 12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:4px;font-size:12px;font-weight:600;color:#15803d;">OK: ${okCount}</span>
    <span style="padding:4px 12px;background:#fffbeb;border:1px solid #fde68a;border-radius:4px;font-size:12px;font-weight:600;color:#d97706;">Low: ${lowCount}</span>
    <span style="padding:4px 12px;background:#fff0f0;border:1px solid #fecaca;border-radius:4px;font-size:12px;font-weight:600;color:#dc2626;">Critical: ${criticalCount}</span>
    <span style="padding:4px 12px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:4px;font-size:12px;font-weight:600;color:#475569;">Total: ${totalItems}</span>
  </div>`;

  const body = `
    ${clinicHeader(clinic)}

    <div class="doc-row">
      <div>
        <div class="doc-title">CURRENT STOCK REPORT</div>
        <div style="font-size:12px;color:#555;margin-top:4px;">Filter: ${filterLabel} &nbsp;·&nbsp; ${totalItems} item${totalItems !== 1 ? "s" : ""}</div>
      </div>
      <div class="doc-id">
        <div style="font-size:11px;color:#888;">Generated: ${generatedAt}</div>
      </div>
    </div>

    ${summaryBadges}

    <table>
      <thead>
        <tr>
          <th class="tc" style="width:36px;">#</th>
          <th>Drug Name</th>
          <th style="width:120px;">Category</th>
          <th class="tr" style="width:110px;">Current Stock</th>
          <th class="tr" style="width:110px;">Reorder Level</th>
          <th class="tr" style="width:90px;">MRP/Unit</th>
          <th class="tc" style="width:80px;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${rowHtml || '<tr><td colspan="7" style="text-align:center;color:#888;padding:20px;">No items found</td></tr>'}
      </tbody>
    </table>

    <div class="footer">
      <p>Current Stock Report — ${clinic.name} &nbsp;·&nbsp; ${generatedAt}</p>
    </div>`;

  open("Current Stock Report", body);
}

// ── printSalesReport ──────────────────────────────────────────────────────────
export function printSalesReport(
  rows: any[],
  dateRange: { from?: string; to?: string },
  clinicOverride?: ClinicInfo
) {
  const clinic = clinicOverride ?? getStoredClinic();
  const generatedAt = new Date().toLocaleString("en-IN", { dateStyle: "long", timeStyle: "short" } as any);
  const fromLabel = dateRange.from
    ? new Date(dateRange.from).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "All";
  const toLabel = dateRange.to
    ? new Date(dateRange.to).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "till date";

  const totBills    = rows.reduce((a, r) => a + (r.billsCreated  || 0), 0);
  const totBilled   = rows.reduce((a, r) => a + (r.totalBilled   || 0), 0);
  const totPaid     = rows.reduce((a, r) => a + (r.totalPaid     || 0), 0);
  const totPayments = rows.reduce((a, r) => a + (r.paymentsCount || 0), 0);
  const totReceived = rows.reduce((a, r) => a + (r.totalReceived || 0), 0);

  const rowHtml = rows.map((r, i) => `
    <tr>
      <td class="tc">${i + 1}</td>
      <td><strong>${r.staffName || "—"}</strong></td>
      <td class="tr">${r.billsCreated || 0}</td>
      <td class="tr">₹${(r.totalBilled || 0).toLocaleString("en-IN")}</td>
      <td class="tr" style="color:#15803d;">₹${(r.totalPaid || 0).toLocaleString("en-IN")}</td>
      <td class="tr">${r.paymentsCount || 0}</td>
      <td class="tr" style="color:#0d9488;">₹${(r.totalReceived || 0).toLocaleString("en-IN")}</td>
    </tr>`).join("");

  const body = `
    ${clinicHeader(clinic)}

    <div class="doc-row">
      <div>
        <div class="doc-title">SALES REPORT BY STAFF</div>
        <div style="font-size:12px;color:#555;margin-top:4px;">Period: ${fromLabel} — ${toLabel}</div>
      </div>
      <div class="doc-id">
        <div style="font-size:11px;color:#888;">Generated: ${generatedAt}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="tc" style="width:36px;">#</th>
          <th>Staff Name</th>
          <th class="tr" style="width:80px;">Bills</th>
          <th class="tr" style="width:110px;">Total Billed</th>
          <th class="tr" style="width:110px;">Collected</th>
          <th class="tr" style="width:80px;">Payments</th>
          <th class="tr" style="width:110px;">Cash Received</th>
        </tr>
      </thead>
      <tbody>
        ${rowHtml || '<tr><td colspan="7" style="text-align:center;color:#888;padding:20px;">No data found</td></tr>'}
      </tbody>
      <tfoot>
        <tr style="background:#f0f0f0;font-weight:800;">
          <td></td>
          <td><strong>TOTAL</strong></td>
          <td class="tr">${totBills}</td>
          <td class="tr">₹${totBilled.toLocaleString("en-IN")}</td>
          <td class="tr" style="color:#15803d;">₹${totPaid.toLocaleString("en-IN")}</td>
          <td class="tr">${totPayments}</td>
          <td class="tr" style="color:#0d9488;">₹${totReceived.toLocaleString("en-IN")}</td>
        </tr>
      </tfoot>
    </table>

    <div class="footer">
      <p>Sales Report — ${clinic.name} &nbsp;·&nbsp; ${generatedAt}</p>
    </div>`;

  open("Sales Report by Staff", body);
}

// ── printLowStockReport ───────────────────────────────────────────────────────
export function printLowStockReport(drugs: any[], filter: string, clinicOverride?: ClinicInfo) {
  const clinic = clinicOverride ?? getStoredClinic();
  const generatedAt = new Date().toLocaleString("en-IN", { dateStyle: "long", timeStyle: "short" } as any);
  const filterLabel = filter === "both" ? "Low + Critical" : filter;

  const rowHtml = drugs.map((d, i) => `
    <tr style="${d.status === "Critical" ? "background:#fff0f0;" : d.status === "Low" ? "background:#fffbeb;" : ""}">
      <td class="tc">${i + 1}</td>
      <td><strong>${d.name || "—"}</strong></td>
      <td>${d.category || "—"}</td>
      <td class="tr">${d.stock} ${d.unit}</td>
      <td class="tr">${d.reorderLevel} ${d.unit}</td>
      <td class="tc"><strong style="color:${d.status === "Critical" ? "#dc2626" : "#d97706"};">${d.status}</strong></td>
    </tr>`).join("");

  const body = `
    ${clinicHeader(clinic)}

    <div class="doc-row">
      <div>
        <div class="doc-title">LOW STOCK REPORT</div>
        <div style="font-size:12px;color:#555;margin-top:4px;">Filter: ${filterLabel} &nbsp;·&nbsp; ${drugs.length} item${drugs.length !== 1 ? "s" : ""}</div>
      </div>
      <div class="doc-id">
        <div style="font-size:11px;color:#888;">Generated: ${generatedAt}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="tc" style="width:36px;">#</th>
          <th>Drug Name</th>
          <th style="width:130px;">Category</th>
          <th class="tr" style="width:110px;">Current Stock</th>
          <th class="tr" style="width:110px;">Reorder Level</th>
          <th class="tc" style="width:80px;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${rowHtml || '<tr><td colspan="6" style="text-align:center;color:#888;padding:20px;">No items found</td></tr>'}
      </tbody>
    </table>

    <div class="footer">
      <p>Low Stock Report — ${clinic.name} &nbsp;·&nbsp; ${generatedAt}</p>
    </div>`;

  open("Low Stock Report", body);
}

// ── printExpiryReport ─────────────────────────────────────────────────────────
export function printExpiryReport(batches: any[], params: { expiryWithin: string }, clinicOverride?: ClinicInfo) {
  const clinic = clinicOverride ?? getStoredClinic();
  const generatedAt = new Date().toLocaleString("en-IN", { dateStyle: "long", timeStyle: "short" } as any);

  const rowHtml = batches.map((b, i) => {
    const daysLeft  = Math.ceil((new Date(b.expiryDate).getTime() - Date.now()) / 86_400_000);
    const isExpired = daysLeft < 0;
    return `
    <tr style="${isExpired ? "background:#fff0f0;" : ""}">
      <td class="tc">${i + 1}</td>
      <td><strong>${b.drugName || "—"}</strong></td>
      <td>${b.drugCategory || "—"}</td>
      <td class="tc" style="font-family:monospace;font-size:11px;">${b.batchNo || "—"}</td>
      <td class="tc">${b.expiryDate ? new Date(b.expiryDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td>
      <td class="tr" style="color:${isExpired ? "#dc2626" : daysLeft <= 30 ? "#d97706" : "#111"};">
        ${isExpired ? `<strong>${Math.abs(daysLeft)}d ago</strong>` : `${daysLeft}d`}
      </td>
      <td class="tr">${b.quantityRemaining} ${b.drugUnit || ""}</td>
      <td class="tc"><strong style="color:${b.status === "Expired" ? "#dc2626" : b.status === "Active" ? "#15803d" : "#888"};">${b.status || "—"}</strong></td>
    </tr>`;
  }).join("");

  const body = `
    ${clinicHeader(clinic)}

    <div class="doc-row">
      <div>
        <div class="doc-title">EXPIRY DATE REPORT</div>
        <div style="font-size:12px;color:#555;margin-top:4px;">Batches expiring within ${params.expiryWithin} days &nbsp;·&nbsp; ${batches.length} batch${batches.length !== 1 ? "es" : ""}</div>
      </div>
      <div class="doc-id">
        <div style="font-size:11px;color:#888;">Generated: ${generatedAt}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="tc" style="width:36px;">#</th>
          <th>Drug Name</th>
          <th style="width:110px;">Category</th>
          <th class="tc" style="width:100px;">Batch No</th>
          <th class="tc" style="width:100px;">Expiry Date</th>
          <th class="tr" style="width:80px;">Days Left</th>
          <th class="tr" style="width:100px;">Qty Remaining</th>
          <th class="tc" style="width:80px;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${rowHtml || '<tr><td colspan="8" style="text-align:center;color:#888;padding:20px;">No batches found</td></tr>'}
      </tbody>
    </table>

    <div class="footer">
      <p>Expiry Report — ${clinic.name} &nbsp;·&nbsp; ${generatedAt}</p>
    </div>`;

  open("Expiry Date Report", body);
}

// ── helpers ───────────────────────────────────────────────────────────────────
function open(title: string, body: string) {
  const win = window.open("", "_blank", "width=860,height=960,scrollbars=yes");
  if (!win) { alert("Pop-ups are blocked. Please allow pop-ups for this site to print."); return; }
  win.document.write(base(title, body));
  win.document.close();
}

function openA5(title: string, body: string) {
  const win = window.open("", "_blank", "width=860,height=600,scrollbars=yes");
  if (!win) { alert("Pop-ups are blocked. Please allow pop-ups for this site to print."); return; }
  win.document.write(baseA5(title, body));
  win.document.close();
}
