"use server";

import { revalidatePath } from "next/cache";
import { requireFounder } from "@/lib/auth";
import { getDb, logAudit, setSetting } from "@/lib/db";
import { getResendConfig, loginCodeEmail, sendEmail } from "@/lib/resend";
import type { ActionState } from "./clients";

export type TeamMember = { id: number; email: string; role: "founder" | "operator" };

export async function listTeam(): Promise<TeamMember[]> {
  const db = await getDb();
  try {
    return await db.query<TeamMember>(
      `SELECT id, email, role FROM foundery.team_members
       ORDER BY (role = 'founder') DESC, email`,
    );
  } catch {
    return [];
  }
}

export async function addTeamMember(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireFounder();

  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const role = String(form.get("role")) === "founder" ? "founder" : "operator";
  if (!email.includes("@")) return { error: "That doesn't look like an email address." };

  const db = await getDb();
  try {
    await db.query(
      `INSERT INTO foundery.team_members (email, role, added_by)
       VALUES ($1, $2, 'founder')
       ON CONFLICT (email) DO UPDATE SET role = excluded.role`,
      [email, role],
    );
  } catch {
    return {
      error:
        "The team table isn't in the database yet — run db/schema.sql against it once (Supabase SQL editor).",
    };
  }

  await logAudit("founder", "team_member_added", "email", undefined, `${email} as ${role}`);
  revalidatePath("/settings");
  return { ok: `${email} can now sign in as ${role}.` };
}

export async function removeTeamMember(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireFounder();
  const id = Number(form.get("id") ?? 0);
  if (!id) return { error: "Nothing to remove." };

  const db = await getDb();
  const [row] = await db.query<{ email: string; role: string }>(
    `SELECT email, role FROM foundery.team_members WHERE id = $1`,
    [id],
  );
  if (!row) return { error: "Already removed." };

  await db.query(`DELETE FROM foundery.team_members WHERE id = $1`, [id]);
  await logAudit("founder", "team_member_removed", "email", undefined, row.email);
  revalidatePath("/settings");
  // The environment fallback (the founder's own address by default) always
  // remains, so removing rows can never lock the founder out.
  return { ok: `${row.email} can no longer sign in.` };
}

/* ------------------------------------------------------------------ resend */

export async function saveResend(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireFounder();

  const apiKey = String(form.get("api_key") ?? "").trim();
  const from = String(form.get("from") ?? "").trim();
  if (!apiKey) return { error: "Paste the Resend API key." };

  await setSetting("resend_api_key", apiKey);
  if (from) await setSetting("resend_from", from);
  await logAudit("founder", "resend_configured", "settings");

  // Prove it immediately: a real code email to the founder's own address.
  const to = String(form.get("test_to") ?? "").trim().toLowerCase();
  if (to.includes("@")) {
    const config = await getResendConfig();
    const message = loginCodeEmail("000000");
    const delivery = await sendEmail(config!, to, "Foundery email test — it works", message.html);
    if (!delivery.ok) {
      return {
        error: `Saved, but the test email failed: ${delivery.error}`,
      };
    }
    revalidatePath("/settings");
    revalidatePath("/login");
    return { ok: `Saved, and a test email is on its way to ${to}.` };
  }

  revalidatePath("/settings");
  revalidatePath("/login");
  return { ok: "Saved — email sign-in codes now go through Resend." };
}
