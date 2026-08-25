"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { getDb, logAudit } from "@/lib/db";
import type { ActionState } from "./clients";

/**
 * Invoices are raised in Zoho Books; Cortex only records that it happened.
 * One mark per client per month, tickable by either role — chasing the raise
 * is the operator's job as much as the founder's.
 */
export async function markInvoiceRaised(_prev: ActionState, form: FormData): Promise<ActionState> {
  const role = await requireRole();
  const clientId = Number(form.get("client_id") ?? 0);
  const month = String(form.get("month") ?? "");
  if (!clientId || !/^\d{4}-\d{2}$/.test(month)) return { error: "Missing client or month." };

  const db = await getDb();
  const [client] = await db.query<{ name: string }>(
    `SELECT name FROM foundery.clients WHERE id = $1`,
    [clientId],
  );
  if (!client) return { error: "That client no longer exists." };

  try {
    await db.query(
      `INSERT INTO foundery.raised_invoices (client_id, month, raised_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (client_id, month) DO NOTHING`,
      [clientId, month, role],
    );
  } catch {
    return {
      error:
        "The database is missing the raised_invoices table — run db/schema.sql against it once (npm run db:setup or the Supabase SQL editor).",
    };
  }

  await logAudit(role, "invoice_marked_raised", "client", clientId, `${client.name} · ${month}`);
  revalidatePath("/invoices");
  revalidatePath("/");
  return { ok: `${client.name} marked raised for ${month}.` };
}

/** Undo a mark made by mistake — the task reappears on the list. */
export async function unmarkInvoiceRaised(_prev: ActionState, form: FormData): Promise<ActionState> {
  const role = await requireRole();
  const clientId = Number(form.get("client_id") ?? 0);
  const month = String(form.get("month") ?? "");
  if (!clientId || !/^\d{4}-\d{2}$/.test(month)) return { error: "Missing client or month." };

  const db = await getDb();
  try {
    await db.query(`DELETE FROM foundery.raised_invoices WHERE client_id = $1 AND month = $2`, [
      clientId,
      month,
    ]);
  } catch {
    return { error: "Couldn't undo the mark — is db/schema.sql applied?" };
  }
  await logAudit(role, "invoice_unmarked", "client", clientId, month);
  revalidatePath("/invoices");
  revalidatePath("/");
  return { ok: "Mark removed — it's back on the list." };
}
