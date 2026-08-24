"use server";

import { revalidatePath } from "next/cache";
import { requireFounder, requireRole, newPublicToken } from "@/lib/auth";
import { getDb, logAudit } from "@/lib/db";
import { FIELD_TYPES, type OnboardingField } from "@/lib/taxonomy";
import { getFormByToken } from "@/lib/queries";
import type { ActionState } from "./clients";

function text(form: FormData, key: string): string | null {
  const value = String(form.get(key) ?? "").trim();
  return value === "" ? null : value;
}

/**
 * Turns the repeated form rows into field definitions. Keys are derived from
 * the label so the founder never has to think about them, and de-duplicated
 * so two questions can't overwrite each other's answers.
 */
function readFields(form: FormData): OnboardingField[] {
  const labels = form.getAll("field_label").map(String);
  const types = form.getAll("field_type").map(String);
  const required = form.getAll("field_required").map(String);
  const hints = form.getAll("field_hint").map(String);

  const seen = new Set<string>();
  const out: OnboardingField[] = [];

  labels.forEach((label, index) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const base =
      trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "question";
    let key = base;
    let n = 2;
    while (seen.has(key)) key = `${base}_${n++}`;
    seen.add(key);

    const type = FIELD_TYPES.includes(types[index] as (typeof FIELD_TYPES)[number])
      ? (types[index] as OnboardingField["type"])
      : "text";

    out.push({
      key,
      label: trimmed,
      type,
      required: required[index] === "1",
      hint: (hints[index] ?? "").trim() || undefined,
    });
  });

  return out;
}

/** Both roles run onboarding, so both can build and share a form. */
export async function saveForm(_prev: ActionState, form: FormData): Promise<ActionState> {
  const role = await requireRole();
  const db = getDb();

  const id = Number(form.get("id") ?? 0) || null;
  const title = String(form.get("title") ?? "").trim();
  if (!title) return { error: "Give the form a title — the client sees it." };

  const fields = readFields(form);
  if (fields.length === 0) return { error: "A form with no questions collects nothing. Add at least one." };

  const status = String(form.get("status")) === "closed" ? "closed" : "open";
  const payload = {
    title,
    intro: text(form, "intro"),
    client_id: Number(form.get("client_id") ?? 0) || null,
    fields: JSON.stringify(fields),
    status,
  };

  if (id) {
    db.prepare(
      `UPDATE onboarding_forms SET title=@title, intro=@intro, client_id=@client_id,
         fields=@fields, status=@status WHERE id=@id`,
    ).run({ ...payload, id });
    logAudit(role, "form_updated", "form", id, title);
    revalidatePath("/onboarding");
    return { ok: "Form updated." };
  }

  const result = db
    .prepare(
      `INSERT INTO onboarding_forms (title, intro, token, client_id, fields, status, created_by)
       VALUES (@title, @intro, @token, @client_id, @fields, @status, @created_by)`,
    )
    .run({ ...payload, token: newPublicToken(), created_by: role });
  logAudit(role, "form_created", "form", result.lastInsertRowid, title);

  revalidatePath("/onboarding");
  return { ok: "Form created — the link is live." };
}

/** Rotating the token kills the old link immediately. */
export async function rotateFormLink(_prev: ActionState, form: FormData): Promise<ActionState> {
  const role = await requireRole();
  const id = Number(form.get("id") ?? 0);
  if (!id) return { error: "Nothing to rotate." };
  getDb().prepare(`UPDATE onboarding_forms SET token = ? WHERE id = ?`).run(newPublicToken(), id);
  logAudit(role, "form_link_rotated", "form", id);
  revalidatePath("/onboarding");
  return { ok: "New link generated. The old one is dead." };
}

export async function deleteForm(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireFounder();
  const id = Number(form.get("id") ?? 0);
  if (!id) return { error: "Nothing to delete." };
  getDb().prepare(`DELETE FROM onboarding_forms WHERE id = ?`).run(id);
  logAudit("founder", "form_deleted", "form", id);
  revalidatePath("/onboarding");
  return { ok: "Form and its responses removed." };
}

/* ------------------------------------------------------------- the public side */

export type SubmitState = { error?: string; done?: boolean };

/**
 * The only unauthenticated write in the app.
 *
 * It accepts nothing but answers to the questions the form actually declares:
 * unknown keys are dropped rather than stored, so a crafted post can't append
 * arbitrary content to a submission. Answers are length-capped for the same
 * reason.
 */
export async function submitOnboarding(_prev: SubmitState, form: FormData): Promise<SubmitState> {
  const token = String(form.get("token") ?? "");
  const definition = getFormByToken(token);
  if (!definition) return { error: "This link isn't valid. Ask your contact at Neuroid for a fresh one." };
  if (definition.status === "closed") {
    return { error: "This form has been closed. Ask your contact at Neuroid for a fresh link." };
  }

  // A hidden field no human ever fills. Bots do.
  if (String(form.get("company_website_confirm") ?? "") !== "") return { done: true };

  const answers: Record<string, string> = {};
  for (const field of definition.fields) {
    const value = String(form.get(`f_${field.key}`) ?? "").trim();
    if (field.required && !value) return { error: `“${field.label}” is needed before you can send this.` };
    if (value) answers[field.key] = value.slice(0, 4000);
  }

  getDb()
    .prepare(`INSERT INTO onboarding_submissions (form_id, answers) VALUES (?, ?)`)
    .run(definition.id, JSON.stringify(answers));
  logAudit("public", "onboarding_submitted", "form", definition.id, definition.title);

  revalidatePath("/onboarding");
  return { done: true };
}
