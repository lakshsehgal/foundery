"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { getDb, logAudit, named } from "@/lib/db";
import {
  isContentDimension, isContentPlatform, isContentStatus, nextContentStatus,
} from "@/lib/taxonomy";

export type ActionState = { error?: string; ok?: string };

function text(form: FormData, key: string): string | null {
  const value = String(form.get(key) ?? "").trim();
  return value === "" ? null : value;
}

/**
 * Content planning is operational — both roles run the pipeline. There is
 * nothing money-shaped on a piece, so unlike clients no field is held back
 * from the operator.
 */
export async function saveContentPiece(_prev: ActionState, form: FormData): Promise<ActionState> {
  const role = await requireRole();
  const db = await getDb();

  const id = Number(form.get("id") ?? 0) || null;
  const title = String(form.get("title") ?? "").trim();
  if (!title) return { error: "A piece needs a working title." };

  const statusRaw = String(form.get("status") ?? "concept");
  const platformRaw = String(form.get("platform") ?? "instagram_reel");
  const dimensionRaw = String(form.get("dimension") ?? "9x16");

  const payload = {
    title,
    status: isContentStatus(statusRaw) ? statusRaw : "concept",
    platform: isContentPlatform(platformRaw) ? platformRaw : "other",
    dimension: isContentDimension(dimensionRaw) ? dimensionRaw : "9x16",
    hook: text(form, "hook"),
    script: text(form, "script"),
    shoot_notes: text(form, "shoot_notes"),
    shoot_date: text(form, "shoot_date"),
    post_date: text(form, "post_date"),
    editor: text(form, "editor"),
    notes: text(form, "notes"),
  };

  if (id) {
    await db.query(
      ...named(
        `UPDATE foundery.content_pieces SET title=@title, status=@status, platform=@platform,
           dimension=@dimension, hook=@hook, script=@script, shoot_notes=@shoot_notes,
           shoot_date=@shoot_date, post_date=@post_date, editor=@editor, notes=@notes,
           updated_at=now()
         WHERE id=@id`,
        { ...payload, id },
      ),
    );
    await logAudit(role, "content_updated", "content_piece", id, title);
  } else {
    const [created] = await db.query<{ id: number }>(
      ...named(
        `INSERT INTO foundery.content_pieces (title, status, platform, dimension, hook, script,
           shoot_notes, shoot_date, post_date, editor, notes)
         VALUES (@title, @status, @platform, @dimension, @hook, @script,
           @shoot_notes, @shoot_date, @post_date, @editor, @notes)
         RETURNING id`,
        payload,
      ),
    );
    await logAudit(role, "content_created", "content_piece", created.id, title);
  }

  revalidatePath("/content");
  return { ok: id ? "Piece updated." : "Piece added to the pipeline." };
}

/** The one-click move down the pipeline — the board's advance button. */
export async function advanceContentPiece(_prev: ActionState, form: FormData): Promise<ActionState> {
  const role = await requireRole();
  const id = Number(form.get("id") ?? 0);
  if (!id) return { error: "Nothing to move." };

  const db = await getDb();
  const [row] = await db.query<{ status: string; title: string }>(
    `SELECT status, title FROM foundery.content_pieces WHERE id = $1`,
    [id],
  );
  if (!row) return { error: "That piece is gone — refresh the board." };
  if (!isContentStatus(row.status)) return { error: "Unknown stage — open the piece and set one." };

  const next = nextContentStatus(row.status);
  if (!next) return { error: "Already posted — end of the line." };

  await db.query(
    `UPDATE foundery.content_pieces SET status = $1, updated_at = now() WHERE id = $2`,
    [next, id],
  );
  await logAudit(role, "content_advanced", "content_piece", id, `${row.title}: ${row.status} → ${next}`);
  revalidatePath("/content");
  return { ok: "Moved along the pipeline." };
}

export async function deleteContentPiece(_prev: ActionState, form: FormData): Promise<ActionState> {
  const role = await requireRole();
  const id = Number(form.get("id") ?? 0);
  if (!id) return { error: "Nothing to delete." };
  const db = await getDb();
  const [row] = await db.query<{ title: string }>(
    `SELECT title FROM foundery.content_pieces WHERE id = $1`,
    [id],
  );
  await db.query(`DELETE FROM foundery.content_pieces WHERE id = $1`, [id]);
  await logAudit(role, "content_deleted", "content_piece", id, row?.title);
  revalidatePath("/content");
  return { ok: "Piece removed." };
}
