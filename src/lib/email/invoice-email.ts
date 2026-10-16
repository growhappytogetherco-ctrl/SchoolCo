/**
 * Invoice email template for Orders & Invoices.
 * Server-only. Never import in client components.
 */
import { sendEmail } from "./resend";

export interface SendInvoiceEmailOptions {
  to:                     string;
  recipientName:          string;
  familyName:             string;
  invoiceNumber:          string;
  invoiceDate:            string;
  dueDate:                string;
  subtotalCents:          number;
  balanceCents:           number;
  itemCount:              number;
  orgName:                string;
  zelleRecipient:         string;
  zelleType:              string;
  checkPayee:             string;
  cashInstructions:       string;
  pdfBytes:               Uint8Array;
  staffName:              string;
}

function currency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export async function sendInvoiceEmail(opts: SendInvoiceEmailOptions): Promise<{ id?: string; error?: string }> {
  const firstName = opts.recipientName.split(" ")[0];

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invoice ${opts.invoiceNumber} — ${opts.orgName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #F8F7F4; color: #1a1a1a; }
    .wrapper { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: #0B1747; padding: 32px 40px; }
    .org-name { font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: -0.3px; }
    .org-tagline { font-size: 11px; color: rgba(255,255,255,0.55); margin-top: 3px; }
    .invoice-tag { display: inline-block; background: #046264; color: #fff; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px; margin-top: 12px; letter-spacing: 0.5px; }
    .body { padding: 36px 40px; }
    .greeting { font-size: 22px; font-weight: 700; color: #0B1747; margin-bottom: 12px; }
    .intro { font-size: 15px; color: #555; line-height: 1.6; margin-bottom: 24px; }
    .summary-box { background: #F0FAF9; border: 1px solid #b2d8d8; border-radius: 12px; padding: 20px 24px; margin-bottom: 28px; }
    .summary-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; color: #444; }
    .summary-row.total { font-size: 16px; font-weight: 700; color: #0B1747; border-top: 1px solid #b2d8d8; padding-top: 10px; margin-top: 4px; }
    .summary-row span:last-child { font-weight: 600; }
    .section-title { font-size: 12px; font-weight: 700; color: #046264; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
    .payment-method { background: #fff; border: 1px solid #e4e4e7; border-radius: 10px; padding: 14px 18px; margin-bottom: 10px; }
    .method-name { font-weight: 700; font-size: 14px; color: #0B1747; margin-bottom: 4px; }
    .method-detail { font-size: 13px; color: #555; }
    .note { font-size: 12px; color: #888; font-style: italic; margin-top: 4px; }
    .footer { background: #F8F7F4; border-top: 1px solid #e4e4e7; padding: 24px 40px; font-size: 12px; color: #999; text-align: center; }
    .footer strong { color: #555; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="org-name">${opts.orgName}</div>
      <div class="org-tagline">A Program of Healing Through Christ Foundation</div>
      <div class="invoice-tag">INVOICE ${opts.invoiceNumber}</div>
    </div>
    <div class="body">
      <div class="greeting">Hi ${firstName},</div>
      <p class="intro">
        Please find your invoice attached for ${opts.itemCount} item${opts.itemCount !== 1 ? "s" : ""}
        from <strong>${opts.orgName}</strong>. A copy of the invoice PDF is attached to this email.
      </p>

      <div class="summary-box">
        <div class="summary-row"><span>Invoice #</span><span>${opts.invoiceNumber}</span></div>
        <div class="summary-row"><span>Invoice Date</span><span>${opts.invoiceDate}</span></div>
        <div class="summary-row"><span>Due Date</span><span>${opts.dueDate}</span></div>
        <div class="summary-row"><span>Order Total</span><span>${currency(opts.subtotalCents)}</span></div>
        ${opts.balanceCents < opts.subtotalCents
          ? `<div class="summary-row"><span>Payments Received</span><span>${currency(opts.subtotalCents - opts.balanceCents)}</span></div>`
          : ""}
        <div class="summary-row total"><span>Balance Due</span><span>${currency(opts.balanceCents)}</span></div>
      </div>

      ${opts.balanceCents > 0 ? `
      <div class="section-title">How to Pay</div>

      <div class="payment-method">
        <div class="method-name">Zelle</div>
        <div class="method-detail">Send to ${opts.zelleType === "email" ? "email" : "phone"}: <strong>${opts.zelleRecipient}</strong></div>
        <div class="note">Include your invoice number in the Zelle memo.</div>
      </div>

      <div class="payment-method">
        <div class="method-name">Check</div>
        <div class="method-detail">Make check payable to: <strong>${opts.checkPayee}</strong></div>
        <div class="note">Include your invoice number on the memo line.</div>
      </div>

      <div class="payment-method">
        <div class="method-name">Cash</div>
        <div class="method-detail">${opts.cashInstructions}</div>
      </div>
      ` : `
      <p style="font-size:15px;color:#046264;font-weight:600;">✓ This invoice is paid in full. Thank you!</p>
      `}
    </div>
    <div class="footer">
      <p>This invoice was sent by <strong>${opts.staffName}</strong> on behalf of ${opts.orgName}.</p>
      <p style="margin-top:8px;">If you have questions about this invoice, please contact your school directly.</p>
    </div>
  </div>
</body>
</html>`;

  const text = `Hi ${firstName},

Invoice ${opts.invoiceNumber} from ${opts.orgName}

Invoice Date: ${opts.invoiceDate}
Due Date: ${opts.dueDate}
Balance Due: ${currency(opts.balanceCents)}

A PDF copy of your invoice is attached.

${opts.balanceCents > 0 ? `HOW TO PAY:
- Zelle: ${opts.zelleRecipient} (include invoice number in memo)
- Check: Payable to ${opts.checkPayee} (include invoice number on memo line)
- Cash: ${opts.cashInstructions}` : "This invoice is paid in full. Thank you!"}

Questions? Contact ${opts.orgName} directly.
`.trim();

  // Convert Uint8Array to Buffer for Resend attachment
  const pdfBuffer = Buffer.from(opts.pdfBytes);

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log("\n[Invoice Email — NOT SENT, no RESEND_API_KEY]");
    console.log(`  To: ${opts.to} | Invoice: ${opts.invoiceNumber} | Balance: ${currency(opts.balanceCents)}`);
    return { id: "dev-mock" };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const fromAddr = process.env.RESEND_FROM_EMAIL ?? "no-reply@schoolco.app";

    const { data, error } = await resend.emails.send({
      from:    fromAddr,
      to:      opts.to,
      subject: `Invoice ${opts.invoiceNumber} from ${opts.orgName} — ${currency(opts.balanceCents)} due ${opts.dueDate}`,
      html,
      text,
      attachments: [{
        filename: `Invoice-${opts.invoiceNumber}.pdf`,
        content:  pdfBuffer,
      }],
    });

    if (error) {
      console.error("[Invoice Email] Resend error:", error);
      return { error: error.message };
    }
    return { id: data?.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Invoice Email] Failed:", msg);
    return { error: msg };
  }
}
