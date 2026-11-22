import { format } from "date-fns";

// jsPDF's built-in fonts are WinAnsi only — map the symbols our notes use.
const ascii = (v: unknown) => String(v ?? "")
  .replace(/₹/g, "Rs.").replace(/×/g, "x").replace(/→/g, "->").replace(/[−–—]/g, "-").replace(/·/g, "|")
  .replace(/[^\x20-\x7E\n]/g, "");

const fmtDate = (v: any) => (v ? format(new Date(v), "dd MMM yyyy, h:mm a") : "");
const fmtDay = (d: string) => format(new Date(`${d}T00:00:00`), "dd MMM yyyy");
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

function clinicName(): string {
  try {
    const u = JSON.parse(localStorage.getItem("carenoww_user") || "{}");
    return u.organization || "";
  } catch {
    return "";
  }
}

const TYPE_LABEL: Record<string, string> = { BillEdit: "Bill edit", Manual: "Manual edit" };

/** Builds the drug ledger (period rows, oldest first, with opening balance) as a PDF and downloads it. */
export async function downloadDrugLedgerPdf(t: any) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 36;
  const s = t.summary;
  const unit = t.drug.unit || "units";
  let y = margin;

  const clinic = clinicName();
  if (clinic) {
    doc.setFont("helvetica", "bold").setFontSize(14).text(ascii(clinic), pageW / 2, y, { align: "center" });
    y += 18;
  }
  doc.setFont("helvetica", "bold").setFontSize(12).text(ascii(`Drug Ledger - ${t.drug.name}`), pageW / 2, y, { align: "center" });
  y += 15;
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(90)
    .text(ascii(`Period ${fmtDay(t.period.from)} to ${fmtDay(t.period.to)}   |   Generated ${format(new Date(), "dd MMM yyyy, h:mm a")}`), pageW / 2, y, { align: "center" });
  y += 20;

  // Summary
  doc.setTextColor(0);
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 4, halign: "center" },
    headStyles: { fillColor: [241, 245, 249], textColor: 30, fontStyle: "bold" },
    head: [["Opening", "Received (GRN)", "Sold (bills)", "Cancelled", "Returned", "Adjusted", "Bill edits", "Closing", "Stock on hand", "Unexplained"]],
    body: [[
      s.opening, signed(s.received), s.sold ? `-${s.sold}` : "0", signed(s.cancelled), signed(s.returned),
      signed(s.adjusted), signed(s.billEdited), s.closing,
      `${s.actualStock} ${unit}${s.held ? ` (+${s.held} held)` : ""}`,
      Math.abs(s.unexplained) < 0.01 ? "0 (OK)" : signed(s.unexplained),
    ]],
  });
  y = (doc as any).lastAutoTable.finalY + 14;

  // Findings
  if (t.findings?.length) {
    doc.setFont("helvetica", "bold").setFontSize(10).text(ascii(`Why is stock ${t.drug.stock}?`), margin, y);
    y += 12;
    doc.setFontSize(8.5);
    for (const f of t.findings) {
      const title = ascii(`${f.level === "critical" ? "[!]" : f.level === "warning" ? "[*]" : "[i]"} ${f.title}`);
      const detail = doc.splitTextToSize(ascii(f.detail), pageW - margin * 2 - 12);
      if (y + 12 + detail.length * 10 > doc.internal.pageSize.getHeight() - margin) { doc.addPage(); y = margin; }
      doc.setFont("helvetica", "bold").text(title, margin, y);
      y += 11;
      doc.setFont("helvetica", "normal").setTextColor(80).text(detail, margin + 12, y);
      doc.setTextColor(0);
      y += detail.length * 10 + 4;
    }
    y += 6;
  }

  // Ledger — ascending by date, starting from the opening balance
  const rows = (t.ledger ?? []).filter((r: any) => r.inPeriod);
  const body: any[] = [
    [fmtDay(t.period.from), "Opening", "", "", "", "", "", String(s.opening), "Balance brought forward"],
    ...rows.map((r: any) => [
      fmtDate(r.at), TYPE_LABEL[r.type] ?? r.type, r.ref, r.party, r.batchNo,
      r.qty > 0 ? `+${r.qty}` : "", r.qty < 0 ? String(-r.qty) : "", String(r.balance), r.note,
    ].map(ascii)),
  ];
  const totIn = rows.filter((r: any) => r.qty > 0).reduce((a: number, r: any) => a + r.qty, 0);
  const totOut = rows.filter((r: any) => r.qty < 0).reduce((a: number, r: any) => a - r.qty, 0);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: "striped",
    styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold" },
    head: [["Date", "Type", "Ref", "Party", "Batch", "In", "Out", "Balance", "Note"]],
    body,
    foot: [["", "", "", "", "Total", `+${Math.round(totIn * 100) / 100}`, String(Math.round(totOut * 100) / 100), String(s.closing), "Closing balance"]],
    footStyles: { fillColor: [241, 245, 249], textColor: 30, fontStyle: "bold" },
    showFoot: "lastPage",
    columnStyles: {
      0: { cellWidth: 92 },
      1: { cellWidth: 52 },
      2: { cellWidth: 62 },
      3: { cellWidth: 110 },
      4: { cellWidth: 70 },
      5: { cellWidth: 38, halign: "right", textColor: [5, 150, 105] },
      6: { cellWidth: 38, halign: "right", textColor: [220, 38, 38] },
      7: { cellWidth: 48, halign: "right", fontStyle: "bold" },
      8: { cellWidth: "auto" },
    },
    didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight();
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(120);
      doc.text(ascii(t.drug.name), margin, h - 16);
      doc.text(`Page ${doc.getCurrentPageInfo().pageNumber}`, pageW - margin, h - 16, { align: "right" });
      doc.setTextColor(0);
    },
  });

  const safeName = t.drug.name.replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  doc.save(`Drug-Ledger_${safeName}_${t.period.from}_to_${t.period.to}.pdf`);
}
