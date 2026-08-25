"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { getDb, logAudit } from "@/lib/db";
import { accountsFrom, getResendConfig, paymentReminderEmail, sendEmail } from "@/lib/resend";
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

/**
 * The second tick: the payment landed in the bank. Only a raised invoice can
 * be paid — the button doesn't render before then, and the update matching on
 * an existing row enforces it server-side too.
 */
export async function markInvoicePaid(_prev: ActionState, form: FormData): Promise<ActionState> {
  const role = await requireRole();
  const clientId = Number(form.get("client_id") ?? 0);
  const month = String(form.get("month") ?? "");
  if (!clientId || !/^\d{4}-\d{2}$/.test(month)) return { error: "Missing client or month." };

  const db = await getDb();
  try {
    const updated = await db.query<{ id: number }>(
      `UPDATE foundery.raised_invoices SET paid_at = now(), paid_by = $3
       WHERE client_id = $1 AND month = $2 AND paid_at IS NULL
       RETURNING id`,
      [clientId, month, role],
    );
    if (updated.length === 0) return { error: "Mark it raised first — payment follows the invoice." };
  } catch {
    return {
      error:
        "The database is missing the payment columns — run db/schema.sql against it once (npm run db:setup or the Supabase SQL editor).",
    };
  }

  await logAudit(role, "invoice_marked_paid", "client", clientId, month);
  revalidatePath("/invoices");
  revalidatePath("/");
  return { ok: `Payment marked received for ${month}.` };
}

/**
 * A payment check-in, sent to the client's billing address from the accounts
 * desk. The copy is deliberately human — see paymentReminderEmail — and the
 * form's details ride in from the task with room to correct them.
 */
export async function sendPaymentReminder(_prev: ActionState, form: FormData): Promise<ActionState> {
  const role = await requireRole();
  const clientId = Number(form.get("client_id") ?? 0);
  const to = String(form.get("to") ?? "").trim();
  const cc = String(form.get("cc") ?? "")
    .split(",")
    .map((address) => address.trim())
    .filter((address) => address.includes("@"))
    .slice(0, 8);
  const brand = String(form.get("brand") ?? "").trim().slice(0, 120);
  const amount = String(form.get("amount") ?? "").trim().slice(0, 60);
  const invoiceNumbers = String(form.get("invoice_numbers") ?? "").trim().slice(0, 120);
  const monthLabel = String(form.get("month_label") ?? "").trim().slice(0, 40);

  if (!to || !to.includes("@")) {
    return { error: "Add the client's billing email — set it once on their profile and it prefills." };
  }
  if (!brand) return { error: "The brand name is missing." };

  const resend = await getResendConfig();
  if (!resend) {
    return { error: "Email isn't connected — add the Resend API key on Settings first." };
  }

  const message = paymentReminderEmail({ brand, amount, invoiceNumbers, monthLabel });
  const delivery = await sendEmail(
    { ...resend, from: await accountsFrom() },
    to,
    message.subject,
    message.html,
    cc,
  );
  if (!delivery.ok) return { error: `Couldn't send: ${delivery.error}` };

  await logAudit(role, "payment_reminder_sent", "client", clientId || undefined, `${brand} · ${to} · ${monthLabel}`);
  return {
    ok: `Reminder sent to ${to}${cc.length > 0 ? ` (cc ${cc.length})` : ""}.`,
  };
}

/** Undo a payment tick made by mistake — the raise mark stays. */
export async function unmarkInvoicePaid(_prev: ActionState, form: FormData): Promise<ActionState> {
  const role = await requireRole();
  const clientId = Number(form.get("client_id") ?? 0);
  const month = String(form.get("month") ?? "");
  if (!clientId || !/^\d{4}-\d{2}$/.test(month)) return { error: "Missing client or month." };

  const db = await getDb();
  try {
    await db.query(
      `UPDATE foundery.raised_invoices SET paid_at = NULL, paid_by = NULL
       WHERE client_id = $1 AND month = $2`,
      [clientId, month],
    );
  } catch {
    return { error: "Couldn't undo — is db/schema.sql applied?" };
  }
  await logAudit(role, "invoice_unmarked_paid", "client", clientId, month);
  revalidatePath("/invoices");
  revalidatePath("/");
  return { ok: "Payment tick removed." };
}

/** Undo a mark made by mistake — the task reappears on the list. */
export async function unmarkInvoiceRaised(_prev: ActionState, form: FormData): Promise<ActionState> {
  const role = await requireRole();
  const clientId = Number(form.get("client_id") ?? 0);
  const month = String(form.get("month") ?? "");
  if (!clientId || !/^\d{4}-\d{2}$/.test(month)) return { error: "Missing client or month." };

  const db = await getDb();
  try {
    // A paid row can't be un-raised — clear the payment tick first.
    const deleted = await db.query<{ id: number }>(
      `DELETE FROM foundery.raised_invoices
       WHERE client_id = $1 AND month = $2 AND paid_at IS NULL
       RETURNING id`,
      [clientId, month],
    );
    if (deleted.length === 0) {
      return { error: "It's marked paid — undo the payment tick first." };
    }
  } catch {
    return { error: "Couldn't undo the mark — is db/schema.sql applied?" };
  }
  await logAudit(role, "invoice_unmarked", "client", clientId, month);
  revalidatePath("/invoices");
  revalidatePath("/");
  return { ok: "Mark removed — it's back on the list." };
}
