"use server";

import { revalidatePath } from "next/cache";
import { requireFounder } from "@/lib/auth";
import { getDb, logAudit, setSetting } from "@/lib/db";
import { writeOperatorSwitch, OPERATOR_SWITCHES } from "@/lib/policy";
import { monthKey } from "@/lib/dates";
import type { ActionState } from "./clients";

export async function saveVisibility(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireFounder();
  for (const switchDef of OPERATOR_SWITCHES) {
    writeOperatorSwitch(switchDef.key, form.get(switchDef.key) !== null);
  }
  logAudit("founder", "visibility_changed");
  revalidatePath("/settings");
  revalidatePath("/clients");
  revalidatePath("/invoices");
  return { ok: "Saved. The operator's view changes on their next page load." };
}

export async function saveBusiness(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireFounder();
  const buffer = String(form.get("cash_buffer") ?? "").replace(/[^0-9.]/g, "");
  setSetting("cash_buffer", buffer);
  setSetting("business_name", String(form.get("business_name") ?? "").trim() || "Neuroid Media");
  logAudit("founder", "business_settings_changed");
  revalidatePath("/settings");
  revalidatePath("/founder");
  return { ok: "Saved." };
}

/**
 * The month-close row: the handful of numbers that aren't derivable from
 * invoices and costs — money in from outside the invoice list, one-off spend,
 * and the tax rate to hold back.
 */
export async function savePnlMonth(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireFounder();
  const month = String(form.get("month") ?? "");
  if (!/^\d{4}-\d{2}$/.test(month)) return { error: "That isn't a month." };
  if (month > monthKey()) return { error: "You can't close a month that hasn't happened yet." };

  const number = (key: string) => {
    const value = Number(String(form.get(key) ?? "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(value) ? value : 0;
  };
  const taxRate = Math.min(100, Math.max(0, number("tax_rate"))) / 100;

  getDb()
    .prepare(
      `INSERT INTO pnl_months (month, other_income, one_off_costs, tax_rate, notes, closed, updated_at)
       VALUES (@month, @other_income, @one_off_costs, @tax_rate, @notes, @closed, datetime('now'))
       ON CONFLICT(month) DO UPDATE SET
         other_income=excluded.other_income, one_off_costs=excluded.one_off_costs,
         tax_rate=excluded.tax_rate, notes=excluded.notes, closed=excluded.closed,
         updated_at=datetime('now')`,
    )
    .run({
      month,
      other_income: number("other_income"),
      one_off_costs: number("one_off_costs"),
      tax_rate: taxRate,
      notes: String(form.get("notes") ?? "").trim() || null,
      closed: form.get("closed") ? 1 : 0,
    });

  logAudit("founder", "pnl_month_saved", "month", month);
  revalidatePath("/pnl");
  return { ok: `${month} saved.` };
}
