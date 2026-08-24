"use server";

import { revalidatePath } from "next/cache";
import { requireFounder, requireRole, newPublicToken } from "@/lib/auth";
import { getDb, logAudit, named } from "@/lib/db";
import {
  ACCESS_ITEMS, FIELD_TYPES, ONBOARDING_DETAIL_FIELDS, type OnboardingField,
} from "@/lib/taxonomy";
import { getFormByToken, getGuidedByToken, publicWelcomeUrl } from "@/lib/queries";
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
  const db = await getDb();

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
    await db.query(
      ...named(
        `UPDATE foundery.onboarding_forms SET title=@title, intro=@intro, client_id=@client_id,
           fields=@fields::jsonb, status=@status WHERE id=@id`,
        { ...payload, id },
      ),
    );
    await logAudit(role, "form_updated", "form", id, title);
    revalidatePath("/onboarding");
    return { ok: "Form updated." };
  }

  const [created] = await db.query<{ id: number }>(
    ...named(
      `INSERT INTO foundery.onboarding_forms (title, intro, token, client_id, fields, status, created_by)
       VALUES (@title, @intro, @token, @client_id, @fields::jsonb, @status, @created_by)
       RETURNING id`,
      { ...payload, token: newPublicToken(), created_by: role },
    ),
  );
  await logAudit(role, "form_created", "form", created.id, title);

  revalidatePath("/onboarding");
  return { ok: "Form created — the link is live." };
}

/** Rotating the token kills the old link immediately. */
export async function rotateFormLink(_prev: ActionState, form: FormData): Promise<ActionState> {
  const role = await requireRole();
  const id = Number(form.get("id") ?? 0);
  if (!id) return { error: "Nothing to rotate." };
  const db = await getDb();
  await db.query(`UPDATE foundery.onboarding_forms SET token = $1 WHERE id = $2`, [
    newPublicToken(),
    id,
  ]);
  await logAudit(role, "form_link_rotated", "form", id);
  revalidatePath("/onboarding");
  return { ok: "New link generated. The old one is dead." };
}

export async function deleteForm(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireFounder();
  const id = Number(form.get("id") ?? 0);
  if (!id) return { error: "Nothing to delete." };
  const db = await getDb();
  await db.query(`DELETE FROM foundery.onboarding_forms WHERE id = $1`, [id]);
  await logAudit("founder", "form_deleted", "form", id);
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
  const definition = await getFormByToken(token);
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

  const db = await getDb();
  await db.query(
    `INSERT INTO foundery.onboarding_submissions (form_id, answers) VALUES ($1, $2::jsonb)`,
    [definition.id, JSON.stringify(answers)],
  );
  await logAudit("public", "onboarding_submitted", "form", definition.id, definition.title);

  revalidatePath("/onboarding");
  return { done: true };
}

/* ------------------------------------------------------ guided onboarding */

/**
 * "Start onboarding" on a client card. One live onboarding per client: if one
 * already exists it's reused, so the button doubles as "get me the link".
 */
export async function startOnboarding(_prev: ActionState, form: FormData): Promise<ActionState> {
  const role = await requireRole();
  const clientId = Number(form.get("client_id") ?? 0);
  if (!clientId) return { error: "No client given." };

  const db = await getDb();
  const [client] = await db.query<{ name: string }>(
    `SELECT name FROM foundery.clients WHERE id = $1`,
    [clientId],
  );
  if (!client) return { error: "That client no longer exists." };

  try {
    const [existing] = await db.query<{ token: string }>(
      `SELECT token FROM foundery.onboardings WHERE client_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [clientId],
    );
    if (existing) {
      return { ok: `Onboarding link ready for ${client.name}.` };
    }

    await db.query(
      `INSERT INTO foundery.onboardings (client_id, token) VALUES ($1, $2)`,
      [clientId, newPublicToken()],
    );
    await logAudit(role, "onboarding_started", "client", clientId, client.name);
    revalidatePath("/clients");
    revalidatePath("/onboarding");
    return { ok: `Onboarding created for ${client.name} — copy the link and send it.` };
  } catch {
    return {
      error:
        "The onboarding table isn't in the database yet — run db/schema.sql against it once (npm run db:setup or the Supabase SQL editor).",
    };
  }
}

export type WelcomeState = { error?: string; ok?: boolean };

/** Step 1 of the client-facing flow: the fixed details form. Public. */
export async function submitWelcomeDetails(
  _prev: WelcomeState,
  form: FormData,
): Promise<WelcomeState> {
  const token = String(form.get("token") ?? "");
  const onboarding = await getGuidedByToken(token);
  if (!onboarding) return { error: "This link isn't valid — ask your contact at Neuroid for a fresh one." };

  const details: Record<string, string> = {};
  for (const field of ONBOARDING_DETAIL_FIELDS) {
    const value = String(form.get(`f_${field.key}`) ?? "").trim();
    if (field.required && !value) return { error: `“${field.label}” is needed before you can continue.` };
    if (value) details[field.key] = value.slice(0, 2000);
  }

  const db = await getDb();
  await db.query(
    `UPDATE foundery.onboardings
     SET details = $1::jsonb,
         status = CASE WHEN status = 'invited' THEN 'details_done' ELSE status END,
         updated_at = now()
     WHERE token = $2`,
    [JSON.stringify(details), token],
  );
  await logAudit("public", "onboarding_details_submitted", "client", onboarding.client_id, onboarding.client_name);
  revalidatePath(`/welcome/${token}`);
  revalidatePath("/clients");
  revalidatePath("/onboarding");
  return { ok: true };
}

/** Step 2: the access checklist. Saveable in parts; completes when all done. */
export async function saveWelcomeAccess(
  _prev: WelcomeState,
  form: FormData,
): Promise<WelcomeState> {
  const token = String(form.get("token") ?? "");
  const onboarding = await getGuidedByToken(token);
  if (!onboarding) return { error: "This link isn't valid — ask your contact at Neuroid for a fresh one." };

  const access: Record<string, { done: boolean; note?: string }> = {};
  for (const item of ACCESS_ITEMS) {
    const done = form.get(`done_${item.key}`) !== null;
    const note = String(form.get(`note_${item.key}`) ?? "").trim().slice(0, 500);
    access[item.key] = note ? { done, note } : { done };
  }
  const allDone = ACCESS_ITEMS.every((item) => access[item.key]?.done);

  const db = await getDb();
  await db.query(
    `UPDATE foundery.onboardings
     SET access = $1::jsonb,
         status = CASE WHEN $2 THEN 'completed' ELSE status END,
         completed_at = CASE WHEN $2 AND completed_at IS NULL THEN now() ELSE completed_at END,
         updated_at = now()
     WHERE token = $3`,
    [JSON.stringify(access), allDone, token],
  );
  await logAudit("public", allDone ? "onboarding_completed" : "onboarding_access_saved", "client", onboarding.client_id, onboarding.client_name);
  revalidatePath(`/welcome/${token}`);
  revalidatePath("/clients");
  revalidatePath("/onboarding");
  return { ok: true };
}

/** The personalised link for a client's onboarding, for the copy button. */
export async function guidedLinkFor(clientId: number): Promise<string | null> {
  await requireRole();
  const db = await getDb();
  try {
    const [row] = await db.query<{ token: string }>(
      `SELECT token FROM foundery.onboardings WHERE client_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [clientId],
    );
    return row ? publicWelcomeUrl(row.token) : null;
  } catch {
    return null;
  }
}
