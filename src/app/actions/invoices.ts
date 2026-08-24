"use server";

import { revalidatePath } from "next/cache";
import { requireFounder, requireRole } from "@/lib/auth";
import { getDb, logAudit, named } from "@/lib/db";
import { addDays, todayISO } from "@/lib/dates";
import { nextInvoiceNumber } from "@/lib/queries";
import type { ActionState } from "./clients";

function text(form: FormData, key: string): string | null {
  const value = String(form.get(key) ?? "").trim();
  return value === "" ? null : value;
}

function num(form: FormData, key: string): number {
  const value = Number(String(form.get(key) ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(value) ? value : 0;
}

/**
 * Both roles can raise and update invoices — chasing money is the operator's
 * job. What an operator cannot do is change the amount: with amounts hidden
 * from them, an edit would be a blind overwrite, and with amounts shown it
 * would still be the founder's number to set. So the figure is only read from
 * the form for a founder, and an existing invoice keeps its amount otherwise.
 */
export async function saveInvoice(_prev: ActionState, form: FormData): Promise<ActionState> {
  const role = await requireRole();
  const db = await getDb();

  const id = Number(form.get("id") ?? 0) || null;
  const clientId = Number(form.get("client_id") ?? 0);
  if (!clientId) return { error: "Pick a client." };

  const [client] = await db.query<{ name: string; terms_days: number; currency: string }>(
    `SELECT name, terms_days, currency FROM foundery.clients WHERE id = $1`,
    [clientId],
  );
  if (!client) return { error: "That client no longer exists." };

  const issueDate = text(form, "issue_date") ?? todayISO();
  const termsDays = Math.max(0, Number(form.get("terms_days") ?? client.terms_days) || 0);
  const dueDate = text(form, "due_date") ?? addDays(issueDate, termsDays);
  const status = ["draft", "sent", "part_paid", "paid", "void"].includes(String(form.get("status")))
    ? String(form.get("status"))
    : "draft";

  // Marking paid without a date is the commonest way a P&L goes wrong.
  const paidDate = status === "paid" ? (text(form, "paid_date") ?? todayISO()) : text(form, "paid_date");

  if (id) {
    const [existing] = await db.query<{ amount: number; amount_paid: number }>(
      `SELECT amount, amount_paid FROM foundery.invoices WHERE id = $1`,
      [id],
    );
    if (!existing) return { error: "That invoice no longer exists." };

    const amount = role === "founder" ? num(form, "amount") : existing.amount;
    const amountPaid =
      status === "paid"
        ? amount
        : role === "founder"
          ? num(form, "amount_paid")
          : existing.amount_paid;

    await db.query(
      ...named(
        `UPDATE foundery.invoices SET client_id=@client_id, period=@period, issue_date=@issue_date,
           due_date=@due_date, terms_days=@terms_days, amount=@amount, amount_paid=@amount_paid,
           status=@status, paid_date=@paid_date, notes=@notes, updated_at=now()
         WHERE id=@id`,
        {
      id,
      client_id: clientId,
      period: text(form, "period"),
      issue_date: issueDate,
      due_date: dueDate,
      terms_days: termsDays,
      amount,
      amount_paid: amountPaid,
      status,
      paid_date: paidDate,
      notes: text(form, "notes"),
        },
      ),
    );
    await logAudit(role, "invoice_updated", "invoice", id, `${client.name} → ${status}`);
  } else {
    const amount = role === "founder" ? num(form, "amount") : 0;
    const number = text(form, "number") ?? (await nextInvoiceNumber());
    const clash = await db.query(`SELECT id FROM foundery.invoices WHERE number = $1`, [number]);
    if (clash.length > 0) return { error: `Invoice ${number} already exists.` };

    const [created] = await db.query<{ id: number }>(
      ...named(
        `INSERT INTO foundery.invoices (client_id, number, period, issue_date, due_date, terms_days,
           amount, amount_paid, currency, status, paid_date, notes)
         VALUES (@client_id, @number, @period, @issue_date, @due_date, @terms_days,
           @amount, @amount_paid, @currency, @status, @paid_date, @notes)
         RETURNING id`,
        {
        client_id: clientId,
        number,
        period: text(form, "period"),
        issue_date: issueDate,
        due_date: dueDate,
        terms_days: termsDays,
        amount,
        amount_paid: status === "paid" ? amount : 0,
        currency: client.currency,
        status,
        paid_date: paidDate,
        notes: text(form, "notes"),
        },
      ),
    );
    await logAudit(role, "invoice_created", "invoice", created.id, `${number} · ${client.name}`);
  }

  revalidatePath("/invoices");
  revalidatePath("/");
  revalidatePath("/pnl");
  revalidatePath("/founder");
  return { ok: id ? "Invoice updated." : "Invoice raised." };
}

/** The one-click chase action: mark it in, dated today. */
export async function markInvoicePaid(_prev: ActionState, form: FormData): Promise<ActionState> {
  const role = await requireRole();
  const id = Number(form.get("id") ?? 0);
  if (!id) return { error: "Nothing to mark." };

  const db = await getDb();
  await db.query(
    `UPDATE foundery.invoices
     SET status='paid', amount_paid=amount, paid_date=$1, updated_at=now()
     WHERE id = $2`,
    [todayISO(), id],
  );
  await logAudit(role, "invoice_paid", "invoice", id);

  revalidatePath("/invoices");
  revalidatePath("/");
  revalidatePath("/pnl");
  return { ok: "Marked as paid." };
}

export async function deleteInvoice(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireFounder();
  const id = Number(form.get("id") ?? 0);
  if (!id) return { error: "Nothing to delete." };
  const db = await getDb();
  await db.query(`DELETE FROM foundery.invoices WHERE id = $1`, [id]);
  await logAudit("founder", "invoice_deleted", "invoice", id);
  revalidatePath("/invoices");
  revalidatePath("/pnl");
  return { ok: "Invoice removed." };
}
