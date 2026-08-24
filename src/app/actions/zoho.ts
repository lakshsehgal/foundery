"use server";

import { revalidatePath } from "next/cache";
import { requireFounder } from "@/lib/auth";
import { getDb, logAudit } from "@/lib/db";
import { fetchZohoInvoices, mapZohoStatus, zohoConfigured, type ZohoInvoice } from "@/lib/zoho";
import { todayISO } from "@/lib/dates";
import type { ActionState } from "./clients";

/**
 * Pull every invoice from Zoho Books and mirror it here.
 *
 * Matching: a Zoho customer maps to a Foundery client by name,
 * case-insensitively. Unmatched customers are skipped and reported — sync
 * never invents clients, because a client card carries commercial judgements
 * (VIP, health, cost to serve) no import can make.
 *
 * Upsert key is Zoho's invoice_id in external_id, so re-running updates in
 * place: a payment recorded in Zoho flips the invoice here on the next sync.
 * Manually-raised Foundery invoices (no external_id) are never touched.
 */
export async function syncZohoInvoices(): Promise<{
  ok?: string;
  error?: string;
  unmatched?: string[];
}> {
  await requireFounder();

  if (!zohoConfigured()) {
    return {
      error:
        "Zoho isn't connected yet. Add ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN and ZOHO_ORG_ID in Vercel — the README's “Zoho Books sync” section walks through getting them.",
    };
  }

  let invoices: ZohoInvoice[];
  try {
    invoices = await fetchZohoInvoices();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Zoho fetch failed." };
  }

  const db = await getDb();
  const clients = await db.query<{ id: number; name: string }>(
    `SELECT id, name FROM foundery.clients`,
  );
  const byName = new Map(clients.map((client) => [client.name.trim().toLowerCase(), client.id]));

  let created = 0;
  let updated = 0;
  const unmatched = new Set<string>();

  for (const invoice of invoices) {
    const clientId = byName.get(invoice.customer_name.trim().toLowerCase());
    if (!clientId) {
      unmatched.add(invoice.customer_name);
      continue;
    }

    const status = mapZohoStatus(invoice.status, invoice.balance, invoice.total);
    const amountPaid = Math.max(0, invoice.total - invoice.balance);
    const paidDate = status === "paid" ? invoice.due_date <= todayISO() ? invoice.due_date : todayISO() : null;

    try {
      const rows = await db.query<{ inserted: boolean }>(
        `INSERT INTO foundery.invoices
           (client_id, number, period, issue_date, due_date, terms_days,
            amount, amount_paid, status, paid_date, notes, external_id)
         VALUES ($1, $2, $3, $4, $5,
                 GREATEST(0, ($5::date - $4::date)),
                 $6, $7, $8, $9, 'Synced from Zoho Books', $10)
         ON CONFLICT (external_id) DO UPDATE SET
           amount = excluded.amount,
           amount_paid = excluded.amount_paid,
           status = excluded.status,
           due_date = excluded.due_date,
           updated_at = now()
         RETURNING (xmax = 0) AS inserted`,
        [
          clientId,
          invoice.invoice_number,
          invoice.date.slice(0, 7),
          invoice.date,
          invoice.due_date,
          invoice.total,
          amountPaid,
          status,
          paidDate,
          invoice.invoice_id,
        ],
      );
      if (rows[0]?.inserted) created += 1;
      else updated += 1;
    } catch (error) {
      // A number collision with a manually-raised invoice, or the external_id
      // column missing on an un-migrated database. Surface the first one.
      return {
        error: `Sync stopped at ${invoice.invoice_number}: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      };
    }
  }

  await logAudit("founder", "zoho_sync", "invoices", undefined, `${created} new, ${updated} updated`);
  revalidatePath("/invoices");
  revalidatePath("/");
  revalidatePath("/pnl");
  revalidatePath("/founder");

  const skipped =
    unmatched.size > 0
      ? ` Skipped ${unmatched.size} customer${unmatched.size === 1 ? "" : "s"} with no matching client: ${[...unmatched].slice(0, 5).join(", ")}${unmatched.size > 5 ? "…" : ""}. Add them as clients (same name as in Zoho) and sync again.`
      : "";

  return {
    ok: `Synced ${invoices.length} invoices from Zoho — ${created} new, ${updated} updated.${skipped}`,
    unmatched: [...unmatched],
  };
}

/** Wrapper matching the useActionState signature. */
export async function syncZohoAction(_prev: ActionState, _form: FormData): Promise<ActionState> {
  const result = await syncZohoInvoices();
  return result.error ? { error: result.error } : { ok: result.ok };
}
