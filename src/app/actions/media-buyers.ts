"use server";

import { revalidatePath } from "next/cache";
import { requireFounder } from "@/lib/auth";
import { getDb, logAudit } from "@/lib/db";
import type { ActionState } from "./clients";

export type MediaBuyer = { id: number; name: string; capacity: number };

/** Active buyers, oldest first. Empty (not an error) until db/schema.sql runs. */
export async function listMediaBuyers(): Promise<MediaBuyer[]> {
  const db = await getDb();
  try {
    return await db.query<MediaBuyer>(
      `SELECT id, name, capacity FROM foundery.media_buyers
       WHERE active ORDER BY created_at ASC, id ASC`,
    );
  } catch {
    return [];
  }
}

export async function addMediaBuyer(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireFounder();
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  if (!name) return { error: "Give the buyer a name." };
  const capacity = Math.min(30, Math.max(1, Number(form.get("capacity") ?? 4) || 4));

  const db = await getDb();
  try {
    await db.query(`INSERT INTO foundery.media_buyers (name, capacity) VALUES ($1, $2)`, [
      name,
      capacity,
    ]);
  } catch {
    return {
      error:
        "The database is missing the media_buyers table — run db/schema.sql against it once (npm run db:setup or the Supabase SQL editor).",
    };
  }
  await logAudit("founder", "media_buyer_added", "media_buyer", undefined, name);
  revalidatePath("/settings");
  revalidatePath("/clients");
  revalidatePath("/founder");
  return { ok: `${name} added to the bench.` };
}

/** Their client assignments fall back to unassigned; nothing else is touched. */
export async function removeMediaBuyer(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireFounder();
  const id = Number(form.get("id") ?? 0);
  if (!id) return { error: "Nothing to remove." };

  const db = await getDb();
  const [row] = await db.query<{ name: string }>(
    `SELECT name FROM foundery.media_buyers WHERE id = $1`,
    [id],
  );
  await db.query(`DELETE FROM foundery.media_buyers WHERE id = $1`, [id]);
  await logAudit("founder", "media_buyer_removed", "media_buyer", id, row?.name);
  revalidatePath("/settings");
  revalidatePath("/clients");
  revalidatePath("/founder");
  return { ok: `${row?.name ?? "Buyer"} removed — their clients are unassigned now.` };
}
