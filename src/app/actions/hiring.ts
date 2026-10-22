"use server";

import { revalidatePath } from "next/cache";
import { requireFounder, requireRole, newPublicToken } from "@/lib/auth";
import { getDb, logAudit, named } from "@/lib/db";
import {
  DEFAULT_LOCATION, collectAnswers, fieldMissingOptions, fieldsFromRows, isApplicantStage,
  isEmployment, isRelocation,
} from "@/lib/hiring";
import { getJobRoleByToken } from "@/lib/queries";
import type { ActionState } from "./clients";

function text(form: FormData, key: string): string | null {
  const value = String(form.get(key) ?? "").trim();
  return value === "" ? null : value;
}

const SCHEMA_HINT =
  "The database is missing the hiring tables — run db/schema.sql against it once (npm run db:setup or the Supabase SQL editor).";

/** Hiring is operational, so both roles can open and edit a role. */
export async function saveJobRole(_prev: ActionState, form: FormData): Promise<ActionState> {
  const role = await requireRole();
  const db = await getDb();

  const id = Number(form.get("id") ?? 0) || null;
  const title = String(form.get("title") ?? "").trim();
  if (!title) return { error: "Give the role a title — it's the headline candidates see." };

  const fields = fieldsFromRows({
    labels: form.getAll("field_label").map(String),
    types: form.getAll("field_type").map(String),
    required: form.getAll("field_required").map(String),
    hints: form.getAll("field_hint").map(String),
    options: form.getAll("field_options").map(String),
  });
  if (fields.length === 0) {
    return { error: "A role with no questions screens nobody. Add at least one." };
  }
  const optionless = fieldMissingOptions(fields);
  if (optionless) {
    return {
      error: `“${optionless.label}” needs at least two choices — comma-separate them in the options box.`,
    };
  }

  const employmentRaw = String(form.get("employment") ?? "full_time");
  const payload = {
    title,
    pitch: text(form, "pitch"),
    location: text(form, "location") ?? DEFAULT_LOCATION,
    employment: isEmployment(employmentRaw) ? employmentRaw : "full_time",
    fields: JSON.stringify(fields),
    status: String(form.get("status")) === "closed" ? "closed" : "open",
  };

  try {
    if (id) {
      await db.query(
        ...named(
          `UPDATE foundery.job_roles
           SET title=@title, pitch=@pitch, location=@location, employment=@employment,
               fields=@fields::jsonb, status=@status, updated_at=now()
           WHERE id=@id`,
          { ...payload, id },
        ),
      );
      await logAudit(role, "job_role_updated", "job_role", id, title);
      revalidatePath("/hiring");
      return { ok: "Role updated — the live page already shows it." };
    }

    const [created] = await db.query<{ id: number }>(
      ...named(
        `INSERT INTO foundery.job_roles (title, pitch, location, employment, token, fields, status, created_by)
         VALUES (@title, @pitch, @location, @employment, @token, @fields::jsonb, @status, @created_by)
         RETURNING id`,
        { ...payload, token: newPublicToken(), created_by: role },
      ),
    );
    await logAudit(role, "job_role_created", "job_role", created.id, title);
    revalidatePath("/hiring");
    return { ok: "Role created — copy the link and start sharing it." };
  } catch {
    return { error: SCHEMA_HINT };
  }
}

/** Rotating the token kills the old application link immediately. */
export async function rotateRoleLink(_prev: ActionState, form: FormData): Promise<ActionState> {
  const role = await requireRole();
  const id = Number(form.get("id") ?? 0);
  if (!id) return { error: "Nothing to rotate." };
  const db = await getDb();
  await db.query(`UPDATE foundery.job_roles SET token = $1, updated_at = now() WHERE id = $2`, [
    newPublicToken(),
    id,
  ]);
  await logAudit(role, "job_role_link_rotated", "job_role", id);
  revalidatePath("/hiring");
  return { ok: "New link generated. The old one is dead." };
}

export async function deleteJobRole(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireFounder();
  const id = Number(form.get("id") ?? 0);
  if (!id) return { error: "Nothing to delete." };
  const db = await getDb();
  await db.query(`DELETE FROM foundery.job_roles WHERE id = $1`, [id]);
  await logAudit("founder", "job_role_deleted", "job_role", id);
  revalidatePath("/hiring");
  return { ok: "Role and its applicants removed." };
}

/* ------------------------------------------------------------- the public side */

export type ApplyState = { error?: string; done?: boolean };

/**
 * The application itself — unauthenticated by design, like the onboarding
 * submissions. It accepts only answers to questions the role declares,
 * everything is length-capped, and the honeypot swallows bots silently.
 */
export async function submitApplication(_prev: ApplyState, form: FormData): Promise<ApplyState> {
  const token = String(form.get("token") ?? "");
  const role = await getJobRoleByToken(token);
  if (!role) return { error: "This link isn't valid. Ask whoever sent it for a fresh one." };
  if (role.status === "closed") {
    return { error: "Applications for this role have closed. Thanks for the interest." };
  }

  // A hidden field no human ever fills. Bots do.
  if (String(form.get("company_website_confirm") ?? "") !== "") return { done: true };

  const name = String(form.get("name") ?? "").trim().slice(0, 200);
  const email = String(form.get("email") ?? "").trim().slice(0, 200);
  const phone = String(form.get("phone") ?? "").trim().slice(0, 50);
  const city = String(form.get("city") ?? "").trim().slice(0, 100);
  if (!name) return { error: "Your name is needed before you can send this." };
  if (!email || !email.includes("@")) return { error: "A working email is needed — it's how we reach you." };
  if (!phone) return { error: "A phone number is needed — interviews get set up on WhatsApp." };
  if (!city) return { error: "Your current city is needed." };

  const relocationRaw = String(form.get("relocation") ?? "");
  if (!isRelocation(relocationRaw)) {
    return { error: "Tell us where you stand on Delhi — the office is in Ghitorni." };
  }

  const resume = String(form.get("resume_url") ?? "").trim().slice(0, 500) || null;

  const { answers, error } = collectAnswers(role.fields, (key) =>
    form.getAll(key).map(String),
  );
  if (error) return { error };

  const db = await getDb();
  try {
    await db.query(
      `INSERT INTO foundery.job_applicants (role_id, name, email, phone, city, relocation, resume_url, answers)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [role.id, name, email, phone, city, relocationRaw, resume, JSON.stringify(answers)],
    );
  } catch {
    return { error: "Something went wrong saving your application — give it another try in a minute." };
  }
  await logAudit("public", "job_application_received", "job_role", role.id, `${name} → ${role.title}`);

  revalidatePath("/hiring");
  return { done: true };
}

/* ----------------------------------------------------------- the pipeline */

export async function setApplicantStage(_prev: ActionState, form: FormData): Promise<ActionState> {
  const role = await requireRole();
  const id = Number(form.get("id") ?? 0);
  const stage = String(form.get("stage") ?? "");
  if (!id || !isApplicantStage(stage)) return { error: "Nothing to move." };
  const db = await getDb();
  await db.query(`UPDATE foundery.job_applicants SET stage = $1 WHERE id = $2`, [stage, id]);
  await logAudit(role, "applicant_stage_changed", "applicant", id, stage);
  revalidatePath("/hiring");
  return { ok: "Moved." };
}

export async function saveApplicantNotes(_prev: ActionState, form: FormData): Promise<ActionState> {
  const role = await requireRole();
  const id = Number(form.get("id") ?? 0);
  if (!id) return { error: "Nothing to save." };
  const notes = String(form.get("notes") ?? "").trim().slice(0, 4000) || null;
  const db = await getDb();
  await db.query(`UPDATE foundery.job_applicants SET notes = $1 WHERE id = $2`, [notes, id]);
  await logAudit(role, "applicant_notes_saved", "applicant", id);
  revalidatePath("/hiring");
  return { ok: "Notes saved." };
}

export async function deleteApplicant(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireFounder();
  const id = Number(form.get("id") ?? 0);
  if (!id) return { error: "Nothing to delete." };
  const db = await getDb();
  await db.query(`DELETE FROM foundery.job_applicants WHERE id = $1`, [id]);
  await logAudit("founder", "applicant_deleted", "applicant", id);
  revalidatePath("/hiring");
  return { ok: "Applicant removed." };
}
