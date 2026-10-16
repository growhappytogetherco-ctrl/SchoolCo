/**
 * Invoice PDF Generator — Rising Leaders Academy
 * Uses pdf-lib to produce a branded invoice PDF.
 * Server-only: never import in client components.
 */
import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from "pdf-lib";

// ── Brand colours ─────────────────────────────────────────────────────────
const NAVY  = rgb(0.043, 0.090, 0.278);   // #0B1747
const TEAL  = rgb(0.016, 0.384, 0.392);   // #046264
const GRAY  = rgb(0.400, 0.400, 0.420);
const BLACK = rgb(0.10,  0.10,  0.12);
const WHITE = rgb(1, 1, 1);
const LIGHT = rgb(0.957, 0.957, 0.961);   // #F4F4F5

// ── Layout constants ──────────────────────────────────────────────────────
const PAGE_W  = 612;   // US Letter
const PAGE_H  = 792;
const MARGIN  = 48;
const COL_R   = PAGE_W - MARGIN;

function currency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function drawLine(page: PDFPage, y: number, color = LIGHT, thickness = 0.5) {
  page.drawLine({ start: { x: MARGIN, y }, end: { x: COL_R, y }, thickness, color });
}

function drawRect(page: PDFPage, x: number, y: number, w: number, h: number, color = LIGHT) {
  page.drawRectangle({ x, y, width: w, height: h, color });
}

export interface InvoiceLineItem {
  item_name:        string;
  size:             string | null;
  student_name:     string | null;
  quantity:         number;
  unit_price_cents: number;
  line_total_cents: number;
}

export interface InvoiceData {
  invoice_number:         string;
  invoice_date:           string;   // e.g. "January 15, 2027"
  due_date:               string;   // e.g. "February 14, 2027"
  family_name:            string;
  billing_recipient_name: string;
  billing_recipient_email:string;
  items:                  InvoiceLineItem[];
  subtotal_cents:         number;
  paid_cents:             number;   // sum of verified payments
  // Payment instructions
  zelle_recipient:        string;   // "321-795-9724"
  zelle_type:             string;   // "phone" | "email"
  check_payee:            string;   // "Healing Through Christ Foundation"
  cash_instructions:      string;
  invoice_footer_text?:   string;
}

export async function generateInvoicePdf(data: InvoiceData): Promise<Uint8Array> {
  const doc  = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);

  const boldFont   = await doc.embedFont(StandardFonts.HelveticaBold);
  const regularFont= await doc.embedFont(StandardFonts.Helvetica);
  const oblFont    = await doc.embedFont(StandardFonts.HelveticaOblique);

  let y = PAGE_H;

  // ── Header bar ────────────────────────────────────────────────────────
  drawRect(page, 0, PAGE_H - 90, PAGE_W, 90, NAVY);

  page.drawText("Rising Leaders Academy", {
    x: MARGIN, y: PAGE_H - 34, size: 18, font: boldFont, color: WHITE,
  });
  page.drawText("A Program of Healing Through Christ Foundation", {
    x: MARGIN, y: PAGE_H - 52, size: 9, font: regularFont, color: rgb(0.75, 0.85, 0.87),
  });
  page.drawText("INVOICE", {
    x: COL_R - 64, y: PAGE_H - 38, size: 22, font: boldFont, color: TEAL,
  });

  y = PAGE_H - 90;

  // ── Invoice meta strip ────────────────────────────────────────────────
  drawRect(page, 0, y - 52, PAGE_W, 52, rgb(0.96, 0.98, 0.98));

  const metaItems = [
    { label: "Invoice #", value: data.invoice_number },
    { label: "Date",      value: data.invoice_date },
    { label: "Due Date",  value: data.due_date },
  ];
  const metaW = (PAGE_W - MARGIN * 2) / 3;
  metaItems.forEach((m, i) => {
    const mx = MARGIN + i * metaW;
    page.drawText(m.label.toUpperCase(), {
      x: mx, y: y - 20, size: 7, font: boldFont, color: GRAY,
    });
    page.drawText(m.value, {
      x: mx, y: y - 35, size: 11, font: boldFont, color: NAVY,
    });
  });

  y -= 52 + 16;

  // ── Bill to ───────────────────────────────────────────────────────────
  page.drawText("BILL TO", { x: MARGIN, y, size: 7, font: boldFont, color: GRAY });
  y -= 14;
  page.drawText(data.family_name, { x: MARGIN, y, size: 13, font: boldFont, color: BLACK });
  y -= 16;
  page.drawText(data.billing_recipient_name, { x: MARGIN, y, size: 10, font: regularFont, color: BLACK });
  y -= 14;
  page.drawText(data.billing_recipient_email, { x: MARGIN, y, size: 9, font: regularFont, color: TEAL });

  y -= 24;
  drawLine(page, y, TEAL, 1.5);
  y -= 16;

  // ── Line items table header ───────────────────────────────────────────
  drawRect(page, MARGIN - 4, y - 20, PAGE_W - MARGIN * 2 + 8, 22, NAVY);

  const COL = {
    item:    MARGIN,
    size:    MARGIN + 200,
    student: MARGIN + 270,
    qty:     MARGIN + 360,
    unit:    MARGIN + 405,
    total:   MARGIN + 460,
  };

  page.drawText("DESCRIPTION",  { x: COL.item,    y: y - 14, size: 8, font: boldFont, color: WHITE });
  page.drawText("SIZE",         { x: COL.size,    y: y - 14, size: 8, font: boldFont, color: WHITE });
  page.drawText("STUDENT",      { x: COL.student, y: y - 14, size: 8, font: boldFont, color: WHITE });
  page.drawText("QTY",          { x: COL.qty,     y: y - 14, size: 8, font: boldFont, color: WHITE });
  page.drawText("UNIT PRICE",   { x: COL.unit,    y: y - 14, size: 8, font: boldFont, color: WHITE });
  page.drawText("TOTAL",        { x: COL.total,   y: y - 14, size: 8, font: boldFont, color: WHITE });

  y -= 22;

  // ── Line items ────────────────────────────────────────────────────────
  let rowAlt = false;
  for (const item of data.items) {
    const rowH = 22;
    if (rowAlt) drawRect(page, MARGIN - 4, y - rowH, PAGE_W - MARGIN * 2 + 8, rowH, rgb(0.97, 0.98, 0.99));
    rowAlt = !rowAlt;

    page.drawText(item.item_name.slice(0, 32),    { x: COL.item,    y: y - 15, size: 9,  font: regularFont, color: BLACK });
    page.drawText(item.size ?? "—",               { x: COL.size,    y: y - 15, size: 9,  font: regularFont, color: BLACK });
    page.drawText((item.student_name ?? "Family").slice(0, 18), { x: COL.student, y: y - 15, size: 9, font: regularFont, color: BLACK });
    page.drawText(String(item.quantity),           { x: COL.qty,     y: y - 15, size: 9,  font: regularFont, color: BLACK });
    page.drawText(currency(item.unit_price_cents), { x: COL.unit,    y: y - 15, size: 9,  font: regularFont, color: BLACK });
    page.drawText(currency(item.line_total_cents), { x: COL.total,   y: y - 15, size: 9,  font: boldFont,    color: BLACK });

    y -= rowH;
  }

  y -= 8;
  drawLine(page, y, TEAL, 1);
  y -= 12;

  // ── Totals block ──────────────────────────────────────────────────────
  const balance = data.subtotal_cents - data.paid_cents;
  const totals: Array<{ label: string; value: string; bold?: boolean; color?: ReturnType<typeof rgb> }> = [
    { label: "Subtotal",         value: currency(data.subtotal_cents) },
    { label: "Payments Received",value: currency(data.paid_cents) },
    { label: "Balance Due",      value: currency(balance), bold: true, color: balance > 0 ? TEAL : GRAY },
  ];

  for (const row of totals) {
    const font = row.bold ? boldFont : regularFont;
    const col  = row.color ?? BLACK;
    const sz   = row.bold ? 11 : 9;
    page.drawText(row.label, { x: COL_R - 180, y, size: sz, font: regularFont, color: GRAY });
    page.drawText(row.value, { x: COL_R - 70,  y, size: sz, font, color: col });
    y -= row.bold ? 18 : 14;
  }

  y -= 16;
  drawLine(page, y, LIGHT);
  y -= 20;

  // ── Payment instructions ──────────────────────────────────────────────
  if (balance > 0) {
    page.drawText("HOW TO PAY", { x: MARGIN, y, size: 8, font: boldFont, color: TEAL });
    y -= 18;

    // Zelle
    page.drawText("Zelle", { x: MARGIN, y, size: 9, font: boldFont, color: BLACK });
    const zelleLabel = data.zelle_type === "email" ? "Email" : "Phone";
    page.drawText(`Send to ${zelleLabel}: ${data.zelle_recipient}`, {
      x: MARGIN + 50, y, size: 9, font: regularFont, color: BLACK,
    });
    y -= 14;

    // Check
    page.drawText("Check",  { x: MARGIN, y, size: 9, font: boldFont, color: BLACK });
    page.drawText(`Payable to: ${data.check_payee}`, {
      x: MARGIN + 50, y, size: 9, font: regularFont, color: BLACK,
    });
    y -= 14;

    // Cash
    page.drawText("Cash",   { x: MARGIN, y, size: 9, font: boldFont, color: BLACK });
    page.drawText(data.cash_instructions, {
      x: MARGIN + 50, y, size: 9, font: regularFont, color: BLACK,
    });
    y -= 14;

    page.drawText("Please include your invoice number with all payments.", {
      x: MARGIN, y, size: 8, font: oblFont, color: GRAY,
    });
    y -= 20;
  }

  // ── Footer ────────────────────────────────────────────────────────────
  if (data.invoice_footer_text) {
    drawLine(page, y, LIGHT);
    y -= 14;
    page.drawText(data.invoice_footer_text, {
      x: MARGIN, y, size: 8, font: regularFont, color: GRAY,
      maxWidth: PAGE_W - MARGIN * 2,
    });
    y -= 14;
  }

  // Bottom rule
  drawRect(page, 0, 0, PAGE_W, 8, TEAL);

  return doc.save();
}
