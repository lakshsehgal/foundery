"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Printer } from "lucide-react";
import { deleteContentPiece, saveContentPiece, type ActionState } from "@/app/actions/content";
import { Button, Field, Select, TextArea, TextInput } from "@/components/ui/form";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import {
  CONTENT_DIMENSIONS, CONTENT_PIPELINE, CONTENT_PLATFORMS, type ContentDimension,
} from "@/lib/taxonomy";
import type { ContentPieceView } from "@/lib/queries";

/**
 * One dialog for the whole piece: the idea, the script, and the shoot
 * brief. The dimension picker draws each frame at its real aspect so
 * "what are we shooting in" is answered by looking, not by remembering
 * what 4:5 means.
 */
export function ContentEditor({
  open, onClose, piece,
}: {
  open: boolean;
  onClose: () => void;
  piece: ContentPieceView | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveContentPiece, {});
  const [removeState, removeAction, removing] = useActionState<ActionState, FormData>(
    deleteContentPiece,
    {},
  );
  const [dimension, setDimension] = useState<ContentDimension>(piece?.dimension ?? "9x16");

  useEffect(() => {
    if (state.ok) {
      toast.success(state.ok);
      onClose();
    }
  }, [state, onClose]);

  useEffect(() => {
    if (removeState.ok) {
      toast.success(removeState.ok);
      onClose();
    }
  }, [removeState, onClose]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={piece ? `Edit ${piece.title}` : "Add a piece"}
      description="The idea, the script, and the shoot brief — everything one piece needs, in one place."
      width={640}
    >
      <form action={action} className="space-y-4">
        {piece && <input type="hidden" name="id" value={piece.id} />}

        <Field label="Working title" htmlFor="title" hint="The name the piece goes by on the board.">
          <TextInput
            id="title"
            name="title"
            defaultValue={piece?.title ?? ""}
            placeholder="Why most D2C ads die in 3 seconds"
            required
            autoFocus
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Stage" htmlFor="status">
            <Select id="status" name="status" defaultValue={piece?.status ?? "concept"}>
              {CONTENT_PIPELINE.map((stage) => (
                <option key={stage.key} value={stage.key}>
                  {stage.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Platform" htmlFor="platform">
            <Select id="platform" name="platform" defaultValue={piece?.platform ?? "instagram_reel"}>
              {CONTENT_PLATFORMS.map((platform) => (
                <option key={platform.key} value={platform.key}>
                  {platform.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Editor" htmlFor="editor" hint="Who's cutting it.">
            <TextInput id="editor" name="editor" defaultValue={piece?.editor ?? ""} placeholder="Unassigned" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Shoot date" htmlFor="shoot_date" hint="When it goes in front of the camera.">
            <TextInput id="shoot_date" name="shoot_date" type="date" defaultValue={piece?.shoot_date ?? ""} />
          </Field>
          <Field label="Post date" htmlFor="post_date" hint="Leave empty until it's ready.">
            <TextInput id="post_date" name="post_date" type="date" defaultValue={piece?.post_date ?? ""} />
          </Field>
        </div>

        <Field
          label="Hook"
          htmlFor="hook"
          hint="The opening line — it earns the next three seconds or nothing else matters."
        >
          <TextInput
            id="hook"
            name="hook"
            defaultValue={piece?.hook ?? ""}
            placeholder="“Everyone tells you to post daily. Here's why that's killing your reach.”"
          />
        </Field>

        <Field label="Script" htmlFor="script" hint="Write it as you'd say it, beat by beat.">
          <TextArea
            id="script"
            name="script"
            rows={8}
            defaultValue={piece?.script ?? ""}
            placeholder={"HOOK —\n\nBODY —\n\nCTA —"}
          />
        </Field>
        {piece && piece.script && (
          <Link
            href={`/content/${piece.id}/script`}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[12px] font-medium transition-colors hover:bg-[var(--color-surface-2)]"
          >
            <Printer size={12} />
            Open the script sheet — print or save as PDF
          </Link>
        )}

        {/* The shoot brief: the frame, drawn at its real aspect, plus the
            notes camera day reads. */}
        <fieldset className="rounded-[var(--radius-md)] border border-[var(--color-line)] p-3.5">
          <legend className="px-1 text-[12px] font-medium text-[var(--color-ink-2)]">
            Shoot brief — dimension
          </legend>
          <div className="grid gap-2 sm:grid-cols-4">
            {CONTENT_DIMENSIONS.map((option) => {
              const selected = dimension === option.key;
              const frameHeight = option.ratio <= 1 ? 30 : 34 / option.ratio;
              const frameWidth = option.ratio <= 1 ? 30 * option.ratio : 34;
              return (
                <label
                  key={option.key}
                  title={option.hint}
                  className={`flex cursor-pointer select-none flex-col items-center gap-1.5 rounded-[var(--radius-md)] border px-2 py-2.5 text-center transition-colors ${
                    selected
                      ? "border-transparent bg-[var(--color-brand)]"
                      : "border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="dimension"
                    value={option.key}
                    checked={selected}
                    onChange={() => setDimension(option.key)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden
                    className="rounded-[3px] border-2"
                    style={{
                      width: Math.round(frameWidth),
                      height: Math.round(frameHeight),
                      borderColor: selected ? "var(--color-brand-ink)" : "var(--color-ink-3)",
                    }}
                  />
                  <span
                    className="block text-[12px] font-semibold leading-tight"
                    style={selected ? { color: "var(--color-brand-ink)" } : undefined}
                  >
                    {option.label.split(" · ")[0]}
                  </span>
                  <span
                    className="block text-[10.5px] leading-tight"
                    style={{
                      color: selected
                        ? "color-mix(in srgb, var(--color-brand-ink) 75%, transparent)"
                        : "var(--color-ink-3)",
                    }}
                  >
                    {option.label.split(" · ")[1]} · {option.spec}
                  </span>
                </label>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11.5px] text-[var(--color-ink-3)]">
            {CONTENT_DIMENSIONS.find((option) => option.key === dimension)?.hint}
          </p>

          <div className="mt-3">
            <Field
              label="Shoot notes"
              htmlFor="shoot_notes"
              hint="Location, wardrobe, props, framing — everything camera day needs to know."
            >
              <TextArea
                id="shoot_notes"
                name="shoot_notes"
                rows={3}
                defaultValue={piece?.shoot_notes ?? ""}
                placeholder="Office desk setup, black tee, phone on tripod at eye level, B-roll of the dashboard…"
              />
            </Field>
          </div>
        </fieldset>

        <Field label="Notes" htmlFor="notes">
          <TextArea id="notes" name="notes" rows={2} defaultValue={piece?.notes ?? ""} />
        </Field>

        {(state.error || removeState.error) && (
          <p role="alert" className="text-[12.5px] text-[var(--color-critical)]">
            {state.error || removeState.error}
          </p>
        )}

        <DialogFooter>
          {piece && (
            <Button
              type="submit"
              variant="danger"
              formAction={removeAction}
              loading={removing}
              className="mr-auto"
              onClick={(event) => {
                if (!window.confirm(`Delete “${piece.title}”? The script goes with it.`)) {
                  event.preventDefault();
                }
              }}
            >
              Delete
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={pending}>
            {piece ? "Save changes" : "Add piece"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
