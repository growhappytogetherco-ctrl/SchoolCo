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
const PAGE_W       = 612;   // US Letter
const PAGE_H       = 792;
const MARGIN       = 48;
const COL_R        = PAGE_W - MARGIN;
const FOOTER_H     = 28;    // teal bottom bar height
const FOOTER_Y     = 0;     // always at page bottom
const CONTENT_TOP  = PAGE_H - 90;  // below header bar
const BOTTOM_LIMIT = FOOTER_H + 16; // minimum y before content zone ends

// How much space the totals + payment instructions block needs (worst case)
const TOTALS_RESERVE = 200;

const COL = {
  item:    MARGIN,
  size:    MARGIN + 200,
  student: MARGIN + 270,
  qty:     MARGIN + 362,
  unit:    MARGIN + 405,
  total:   MARGIN + 460,
};

function currency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function drawLine(page: PDFPage, y: number, color = LIGHT, thickness = 0.5) {
  page.drawLine({ start: { x: MARGIN, y }, end: { x: COL_R, y }, thickness, color });
}

function drawRect(page: PDFPage, x: number, y: number, w: number, h: number, color = LIGHT) {
  page.drawRectangle({ x, y, width: w, height: h, color });
}

function drawFooterBar(
  page: PDFPage,
  boldFont: PDFFont,
  regularFont: PDFFont,
  orgContact?: string,
) {
  drawRect(page, 0, FOOTER_Y, PAGE_W, FOOTER_H, TEAL);
  if (orgContact) {
    page.drawText(orgContact, {
      x: PAGE_W / 2 - (orgContact.length * 3.2),
      y: FOOTER_Y + 9,
      size: 8,
      font: regularFont,
      color: WHITE,
    });
  }
}

function drawPageHeader(
  page: PDFPage,
  boldFont: PDFFont,
  regularFont: PDFFont,
) {
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
}

function drawTableHeader(page: PDFPage, y: number, boldFont: PDFFont) {
  drawRect(page, MARGIN - 4, y - 20, PAGE_W - MARGIN * 2 + 8, 22, NAVY);
  page.drawText("DESCRIPTION",  { x: COL.item,    y: y - 14, size: 8, font: boldFont, color: WHITE });
  page.drawText("SIZE",         { x: COL.size,    y: y - 14, size: 8, font: boldFont, color: WHITE });
  page.drawText("STUDENT",      { x: COL.student, y: y - 14, size: 8, font: boldFont, color: WHITE });
  page.drawText("QTY",          { x: COL.qty,     y: y - 14, size: 8, font: boldFont, color: WHITE });
  page.drawText("UNIT PRICE",   { x: COL.unit,    y: y - 14, size: 8, font: boldFont, color: WHITE });
  page.drawText("TOTAL",        { x: COL.total,   y: y - 14, size: 8, font: boldFont, color: WHITE });
  return y - 22;
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
  // Optional
  org_contact?:           string;   // shown in footer bar, e.g. "risingleadersacademy.org"
  invoice_footer_text?:   string;   // deprecated; kept for back-compat
}

export async function generateInvoicePdf(data: InvoiceData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();

  const boldFont    = await doc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await doc.embedFont(StandardFonts.Helvetica);
  const oblFont     = await doc.embedFont(StandardFonts.HelveticaOblique);

  const balance = data.subtotal_cents - data.paid_cents;
  const orgContact = data.org_contact ?? data.invoice_footer_text;

  // ── Helper: add a fresh page with header + footer ──────────────────────
  function addPage(): { page: PDFPage; y: number } {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    drawPageHeader(page, boldFont, regularFont);
    drawFooterBar(page, boldFont, regularFont, orgContact);
    return { page, y: CONTENT_TOP };
  }

  // ── Page 1 ────────────────────────────────────────────────────────────
  let { page, y } = addPage();

  // ── Invoice meta strip ─────────────────────────────────────────────────
  drawRect(page, 0, y - 52, PAGE_W, 52, rgb(0.96, 0.98, 0.98));

  const metaItems = [
    { label: "Invoice #", value: data.invoice_number },
    { label: "Date",      value: data.invoice_date   },
    { label: "Due Date",  value: data.due_date        },
  ];
  const metaW = (PAGE_W - MARGIN * 2) / 3;
  metaItems.forEach((m, i) => {
    const mx = MARGIN + i * metaW;
    page.drawText(m.label.toUpperCase(), { x: mx, y: y - 20, size: 7,  font: boldFont,    color: GRAY  });
    page.drawText(m.value,               { x: mx, y: y - 35, size: 11, font: boldFont,    color: NAVY  });
  });

  y -= 52 + 16;

  // ── Bill To ────────────────────────────────────────────────────────────
  // Show billing_recipient_name as the primary name.
  // Only add a second name line when family_name differs (e.g. "Young Family" vs "Kate Young").
  // Show email below the name, or skip entirely if absent.
  page.drawText("BILL TO", { x: MARGIN, y, size: 7, font: boldFont, color: GRAY });
  y -= 14;
  page.drawText(data.billing_recipient_name, { x: MARGIN, y, size: 13, font: boldFont, color: BLACK });
  y -= 16;
  const showFamilyLine = data.family_name && data.family_name.trim() !== data.billing_recipient_name.trim();
  if (showFamilyLine) {
    page.drawText(data.family_name, { x: MARGIN, y, size: 10, font: regularFont, color: BLACK });
    y -= 14;
  }
  if (data.billing_recipient_email) {
    page.drawText(data.billing_recipient_email, { x: MARGIN, y, size: 9, font: regularFont, color: TEAL });
    y -= 14;
  }

  y -= 24;
  drawLine(page, y, TEAL, 1.5);
  y -= 16;

  // ── Line items table ───────────────────────────────────────────────────
  y = drawTableHeader(page, y, boldFont);

  let rowAlt = false;
  const ROW_H = 22;

  for (const item of data.items) {
    // Page break: if adding this row + totals reserve would go below safe limit
    if (y - ROW_H < BOTTOM_LIMIT + TOTALS_RESERVE) {
      // Close out current page
      drawFooterBar(page, boldFont, regularFont, orgContact);

      // New page — continuation
      ({ page, y } = addPage());
      page.drawText("(continued)", { x: MARGIN, y: y + 8, size: 8, font: oblFont, color: GRAY });
      y -= 8;
      y = drawTableHeader(page, y, boldFont);
      rowAlt = false;
    }

    if (rowAlt) drawRect(page, MARGIN - 4, y - ROW_H, PAGE_W - MARGIN * 2 + 8, ROW_H, rgb(0.97, 0.98, 0.99));
    rowAlt = !rowAlt;

    page.drawText(item.item_name.slice(0, 32),                        { x: COL.item,    y: y - 15, size: 9, font: regularFont, color: BLACK });
    page.drawText(item.size ?? "—",                                   { x: COL.size,    y: y - 15, size: 9, font: regularFont, color: BLACK });
    page.drawText((item.student_name ?? "Family").slice(0, 18),       { x: COL.student, y: y - 15, size: 9, font: regularFont, color: BLACK });
    page.drawText(String(item.quantity),                               { x: COL.qty,     y: y - 15, size: 9, font: regularFont, color: BLACK });
    page.drawText(currency(item.unit_price_cents),                     { x: COL.unit,    y: y - 15, size: 9, font: regularFont, color: BLACK });
    page.drawText(currency(item.line_total_cents),                     { x: COL.total,   y: y - 15, size: 9, font: boldFont,    color: BLACK });

    y -= ROW_H;
  }

  y -= 8;
  drawLine(page, y, TEAL, 1);
  y -= 12;

  // ── Totals block ──────────────────────────────────────────────────────
  const totals: Array<{ label: string; value: string; bold?: boolean; color?: ReturnType<typeof rgb> }> = [
    { label: "Subtotal",          value: currency(data.subtotal_cents) },
    { label: "Payments Received", value: currency(data.paid_cents)     },
    { label: "Balance Due",       value: currency(balance), bold: true, color: balance > 0 ? TEAL : GRAY },
  ];

  for (const row of totals) {
    const font = row.bold ? boldFont : regularFont;
    const col  = row.color ?? BLACK;
    const sz   = row.bold ? 11 : 9;
    page.drawText(row.label, { x: COL_R - 180, y, size: sz, font: regularFont, color: GRAY  });
    page.drawText(row.value, { x: COL_R - 70,  y, size: sz, font,              color: col   });
    y -= row.bold ? 18 : 14;
  }

  // ── Paid-in-full stamp ────────────────────────────────────────────────
  if (balance <= 0) {
    y -= 8;
    drawRect(page, MARGIN - 4, y - 24, 130, 24, rgb(0.94, 0.99, 0.96));
    page.drawLine({
      start: { x: MARGIN - 4, y: y - 24 }, end: { x: MARGIN - 4 + 130, y },
      thickness: 1, color: rgb(0.18, 0.72, 0.44),
    });
    page.drawLine({
      start: { x: MARGIN - 4, y }, end: { x: MARGIN - 4 + 130, y: y - 24 },
      thickness: 1, color: rgb(0.18, 0.72, 0.44),
    });
    page.drawRectangle({ x: MARGIN - 4, y: y - 24, width: 130, height: 24, borderColor: rgb(0.18, 0.72, 0.44), borderWidth: 1.5 });
    page.drawText("PAID IN FULL", {
      x: MARGIN + 8, y: y - 16, size: 11, font: boldFont, color: rgb(0.08, 0.55, 0.32),
    });
    y -= 32;
  }

  y -= 16;
  drawLine(page, y, LIGHT);
  y -= 20;

  // ── Payment instructions (only when balance > 0) ──────────────────────
  if (balance > 0) {
    page.drawText("HOW TO PAY", { x: MARGIN, y, size: 8, font: boldFont, color: TEAL });
    y -= 18;

    const instrRows: Array<{ label: string; text: string }> = [
      {
        label: "Zelle",
        text: `Send to ${data.zelle_type === "email" ? "Email" : "Phone"}: ${data.zelle_recipient}`,
      },
      {
        label: "Check",
        text: `Payable to: ${data.check_payee}`,
      },
      {
        label: "Cash",
        text: data.cash_instructions,
      },
    ];

    for (const row of instrRows) {
      page.drawText(row.label, { x: MARGIN,      y, size: 9, font: boldFont,    color: BLACK });
      page.drawText(row.text,  { x: MARGIN + 52, y, size: 9, font: regularFont, color: BLACK,
        maxWidth: COL_R - MARGIN - 52 });
      y -= 16;
    }

    y -= 4;
    page.drawText("Please include your invoice number with all payments.", {
      x: MARGIN, y, size: 8, font: oblFont, color: GRAY,
    });
    y -= 20;
  }

  return doc.save();
}
