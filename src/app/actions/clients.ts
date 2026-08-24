"use server";

import { revalidatePath } from "next/cache";
import { requireFounder, requireRole } from "@/lib/auth";
import { getDb, logAudit } from "@/lib/db";
import { isCostCategory } from "@/lib/taxonomy";

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "client";
}

function uniqueSlug(base: string, excludeId?: number): string {
  const db = getDb();
  let slug = base;
  let n = 2;
  for (;;) {
    const clash = db
      .prepare(`SELECT id FROM clients WHERE slug = ?${excludeId ? " AND id != ?" : ""}`)
      .get(...(excludeId ? [slug, excludeId] : [slug])) as { id: number } | undefined;
    if (!clash) return slug;
    slug = `${base}-${n++}`;
  }
}

function num(form: FormData, key: string): number {
  const value = Number(String(form.get(key) ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(value) ? value : 0;
}

function text(form: FormData, key: string): string | null {
  const value = String(form.get(key) ?? "").trim();
  return value === "" ? null : value;
}

export type ActionState = { error?: string; ok?: string };

/**
 * Both roles may add and edit a client — the operator runs onboarding and
 * needs to. The money fields are the exception: they are only read off the
 * form when a founder submits, so an operator's post can never write them
 * even if the inputs are forged.
 */
export async function saveClient(_prev: ActionState, form: FormData): Promise<ActionState> {
  const role = await requireRole();
  const db = getDb();

  const id = Number(form.get("id") ?? 0) || null;
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "A client needs a name." };

  const services = form.getAll("services").map(String).filter(Boolean);
  const engagement = String(form.get("engagement") ?? "retainer") === "one_time" ? "one_time" : "retainer";
  const status = ["active", "paused", "churned"].includes(String(form.get("status")))
    ? String(form.get("status"))
    : "active";
  const billingDay = Math.min(31, Math.max(1, Number(form.get("billing_day") ?? 1) || 1));
  const termsDays = Math.max(0, Number(form.get("terms_days") ?? 15) || 0);

  const common = {
    name,
    status,
    engagement,
    vip: form.get("vip") ? 1 : 0,
    services: JSON.stringify(services),
    owner: text(form, "owner"),
    start_date: text(form, "start_date"),
    end_date: text(form, "end_date"),
    billing_day: billingDay,
    terms_days: termsDays,
    notes: text(form, "notes"),
  };

  const founderFields =
    role === "founder"
      ? {
          retainer_amount: num(form, "retainer_amount"),
          one_time_value: num(form, "one_time_value"),
          delivery_cost: num(form, "delivery_cost"),
          health: ["green", "amber", "red"].includes(String(form.get("health")))
            ? String(form.get("health"))
            : "green",
        }
      : null;

  if (id) {
    db.prepare(
      `UPDATE clients SET name=@name, slug=@slug, status=@status, engagement=@engagement,
         vip=@vip, services=@services, owner=@owner, start_date=@start_date, end_date=@end_date,
         billing_day=@billing_day, terms_days=@terms_days, notes=@notes,
         updated_at=datetime('now')
       WHERE id=@id`,
    ).run({ ...common, slug: uniqueSlug(slugify(name), id), id });

    if (founderFields) {
      db.prepare(
        `UPDATE clients SET retainer_amount=@retainer_amount, one_time_value=@one_time_value,
           delivery_cost=@delivery_cost, health=@health, updated_at=datetime('now')
         WHERE id=@id`,
      ).run({ ...founderFields, id });
    }
    logAudit(role, "client_updated", "client", id, name);
  } else {
    const result = db
      .prepare(
        `INSERT INTO clients (name, slug, status, engagement, vip, services, owner,
           start_date, end_date, billing_day, terms_days, notes,
           retainer_amount, one_time_value, delivery_cost, health)
         VALUES (@name, @slug, @status, @engagement, @vip, @services, @owner,
           @start_date, @end_date, @billing_day, @terms_days, @notes,
           @retainer_amount, @one_time_value, @delivery_cost, @health)`,
      )
      .run({
        ...common,
        slug: uniqueSlug(slugify(name)),
        retainer_amount: founderFields?.retainer_amount ?? 0,
        one_time_value: founderFields?.one_time_value ?? 0,
        delivery_cost: founderFields?.delivery_cost ?? 0,
        health: founderFields?.health ?? "green",
      });
    logAudit(role, "client_created", "client", result.lastInsertRowid, name);
  }

  revalidatePath("/clients");
  revalidatePath("/");
  revalidatePath("/founder");
  return { ok: id ? "Client updated." : "Client added." };
}

/** Deleting takes a client's invoices with it, so it stays with the founder. */
export async function deleteClient(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireFounder();
  const id = Number(form.get("id") ?? 0);
  if (!id) return { error: "Nothing to delete." };
  const row = getDb().prepare(`SELECT name FROM clients WHERE id = ?`).get(id) as
    | { name: string }
    | undefined;
  getDb().prepare(`DELETE FROM clients WHERE id = ?`).run(id);
  logAudit("founder", "client_deleted", "client", id, row?.name);
  revalidatePath("/clients");
  revalidatePath("/invoices");
  return { ok: "Client removed." };
}

/* ------------------------------------------------------------------ costs */

/**
 * Costs are founder-write. The operator reads the categories but doesn't set
 * the numbers — otherwise the salary redaction would be trivially defeated
 * by editing a row and reading back what was there.
 */
export async function saveCost(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireFounder();
  const db = getDb();

  const id = Number(form.get("id") ?? 0) || null;
  const category = String(form.get("category") ?? "");
  if (!isCostCategory(category)) return { error: "Pick a category." };
  const label = String(form.get("label") ?? "").trim();
  if (!label) return { error: "Give the cost a name — future you won't remember what it was." };

  const cadence = ["monthly", "annual", "one_time"].includes(String(form.get("cadence")))
    ? String(form.get("cadence"))
    : "monthly";

  const payload = {
    category,
    label,
    person: text(form, "person"),
    amount: num(form, "amount"),
    cadence,
    start_date: text(form, "start_date"),
    end_date: text(form, "end_date"),
    active: form.get("active") ? 1 : 0,
    client_id: Number(form.get("client_id") ?? 0) || null,
    notes: text(form, "notes"),
  };

  if (id) {
    db.prepare(
      `UPDATE costs SET category=@category, label=@label, person=@person, amount=@amount,
         cadence=@cadence, start_date=@start_date, end_date=@end_date, active=@active,
         client_id=@client_id, notes=@notes, updated_at=datetime('now')
       WHERE id=@id`,
    ).run({ ...payload, id });
    logAudit("founder", "cost_updated", "cost", id, `${category}: ${label}`);
  } else {
    const result = db
      .prepare(
        `INSERT INTO costs (category, label, person, amount, cadence, start_date, end_date,
           active, client_id, notes)
         VALUES (@category, @label, @person, @amount, @cadence, @start_date, @end_date,
           @active, @client_id, @notes)`,
      )
      .run(payload);
    logAudit("founder", "cost_created", "cost", result.lastInsertRowid, `${category}: ${label}`);
  }

  revalidatePath("/costs");
  revalidatePath("/founder");
  revalidatePath("/pnl");
  return { ok: id ? "Cost updated." : "Cost added." };
}

export async function deleteCost(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireFounder();
  const id = Number(form.get("id") ?? 0);
  if (!id) return { error: "Nothing to delete." };
  getDb().prepare(`DELETE FROM costs WHERE id = ?`).run(id);
  logAudit("founder", "cost_deleted", "cost", id);
  revalidatePath("/costs");
  revalidatePath("/founder");
  return { ok: "Cost removed." };
}
