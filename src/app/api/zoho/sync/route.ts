import { NextResponse } from "next/server";
import { getDb, logAudit } from "@/lib/db";
import { fetchZohoInvoices, mapZohoStatus, zohoConfigured } from "@/lib/zoho";
import { todayISO } from "@/lib/dates";

/**
 * The nightly sync, fired by Vercel Cron (see vercel.json). Same logic as the
 * founder's button, without a session: Vercel authenticates the call with
 * CRON_SECRET instead. Not configured → quiet no-op, so the cron can ship
 * before the credentials do.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (!zohoConfigured()) return NextResponse.json({ skipped: "zoho not configured" });

  const invoices = await fetchZohoInvoices();
  const db = await getDb();
  const clients = await db.query<{ id: number; name: string; zoho_name: string | null }>(
    `SELECT id, name, zoho_name FROM foundery.clients`,
  );
  // The explicit Zoho mapping wins; the plain client name is the fallback, so
  // a brand named the same in both systems needs no mapping at all.
  const byName = new Map<string, number>();
  for (const client of clients) byName.set(client.name.trim().toLowerCase(), client.id);
  for (const client of clients) {
    if (client.zoho_name) byName.set(client.zoho_name.trim().toLowerCase(), client.id);
  }

  let synced = 0;
  let unmatched = 0;
  for (const invoice of invoices) {
    const clientId = byName.get(invoice.customer_name.trim().toLowerCase());
    if (!clientId) {
      unmatched += 1;
      continue;
    }
    const status = mapZohoStatus(invoice.status, invoice.balance, invoice.total);
    await db.query(
      `INSERT INTO foundery.invoices
         (client_id, number, period, issue_date, due_date, terms_days,
          amount, amount_paid, status, paid_date, notes, external_id)
       VALUES ($1, $2, $3, $4, $5, GREATEST(0, ($5::date - $4::date)),
               $6, $7, $8, $9, 'Synced from Zoho Books', $10)
       ON CONFLICT (external_id) DO UPDATE SET
         amount = excluded.amount, amount_paid = excluded.amount_paid,
         status = excluded.status, due_date = excluded.due_date, updated_at = now()`,
      [
        clientId,
        invoice.invoice_number,
        invoice.date.slice(0, 7),
        invoice.date,
        invoice.due_date,
        invoice.total,
        Math.max(0, invoice.total - invoice.balance),
        status,
        status === "paid" ? todayISO() : null,
        invoice.invoice_id,
      ],
    );
    synced += 1;
  }

  await logAudit("founder", "zoho_sync_cron", "invoices", undefined, `${synced} synced, ${unmatched} unmatched`);
  return NextResponse.json({ synced, unmatched });
}
