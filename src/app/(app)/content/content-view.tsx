"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { ArrowRight, Clapperboard, FileText, Pencil, Plus, Search } from "lucide-react";
import { advanceContentPiece, type ActionState } from "@/app/actions/content";
import { Button, Select, TextInput } from "@/components/ui/form";
import { Chip, EmptyState } from "@/components/ui/primitives";
import {
  CONTENT_DIMENSION, CONTENT_PIPELINE, CONTENT_PLATFORM, CONTENT_PLATFORMS,
  CONTENT_STATUS,
} from "@/lib/taxonomy";
import type { ContentPieceView } from "@/lib/queries";
import { daysUntil, prettyDate } from "@/lib/dates";
import { ContentEditor } from "./content-editor";

/** A tiny frame drawn at the piece's real aspect — the crop, at a glance. */
export function DimensionGlyph({ dimension }: { dimension: ContentPieceView["dimension"] }) {
  const ratio = CONTENT_DIMENSION[dimension].ratio;
  const height = ratio >= 1 ? 8 : 12;
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-[2px] border-[1.5px] border-current opacity-70"
      style={{ width: Math.round(height * ratio), height }}
    />
  );
}

function AdvanceSubmit({ label, title }: { label: string; title: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title={title}
      className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-[11.5px] font-semibold text-[var(--color-ink-2)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-ink)] disabled:opacity-50"
    >
      {label}
      <ArrowRight size={12} />
    </button>
  );
}

/**
 * The action state lives in ContentView, not here: on success the card
 * jumps to the next group, which unmounts this component — a toast owned
 * here would die with it before the effect ever ran.
 */
function AdvanceButton({
  piece, action,
}: {
  piece: ContentPieceView;
  action: (formData: FormData) => void;
}) {
  const label = CONTENT_STATUS[piece.status].advance;
  if (!label) return null;

  return (
    <form action={action} onClick={(event) => event.stopPropagation()}>
      <input type="hidden" name="id" value={piece.id} />
      <AdvanceSubmit label={label} title={`${label} — move “${piece.title}” to the next stage`} />
    </form>
  );
}

/** When the date line should raise its voice, and what it should say. */
function shootLine(piece: ContentPieceView, today: string): { text: string; late: boolean } | null {
  if (piece.status === "posted") {
    return piece.post_date ? { text: `Posted ${prettyDate(piece.post_date)}`, late: false } : null;
  }
  if (piece.status === "ready" && piece.post_date) {
    return { text: `Posting ${prettyDate(piece.post_date)}`, late: false };
  }
  if (!piece.shoot_date) return null;
  if (piece.status === "shot" || piece.status === "editing" || piece.status === "ready") {
    return { text: `Shot ${prettyDate(piece.shoot_date)}`, late: false };
  }
  const days = daysUntil(piece.shoot_date, today);
  if (days < 0) {
    return {
      text: `Shoot ${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} overdue`,
      late: true,
    };
  }
  if (days === 0) return { text: "Shoot today", late: false };
  return { text: `Shoot ${prettyDate(piece.shoot_date)}`, late: false };
}

export function ContentView({ pieces, today }: { pieces: ContentPieceView[]; today: string }) {
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("live");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [editing, setEditing] = useState<ContentPieceView | null>(null);
  const [open, setOpen] = useState(false);
  // Bumped on every open so each open is a fresh mount with fresh action
  // state — same trick as the client editor, for the same reopening bug.
  const [openedAt, setOpenedAt] = useState(0);

  const [advanceState, advanceAction] = useActionState<ActionState, FormData>(
    advanceContentPiece,
    {},
  );

  useEffect(() => {
    if (advanceState.ok) toast.success(advanceState.ok);
    if (advanceState.error) toast.error(advanceState.error);
  }, [advanceState]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return pieces.filter((piece) => {
      if (stageFilter === "live" && piece.status === "posted") return false;
      if (stageFilter !== "live" && stageFilter !== "all" && piece.status !== stageFilter)
        return false;
      if (platformFilter !== "all" && piece.platform !== platformFilter) return false;
      if (!needle) return true;
      return (
        piece.title.toLowerCase().includes(needle) ||
        (piece.hook ?? "").toLowerCase().includes(needle) ||
        (piece.editor ?? "").toLowerCase().includes(needle)
      );
    });
  }, [pieces, query, stageFilter, platformFilter]);

  function edit(piece: ContentPieceView | null) {
    setEditing(piece);
    setOpen(true);
    setOpenedAt((n) => n + 1);
  }

  const groups = CONTENT_PIPELINE.map((stage) => ({
    ...stage,
    pieces: filtered.filter((piece) => piece.status === stage.key),
  })).filter((group) => group.pieces.length > 0);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)]"
          />
          <TextInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, hook or editor"
            aria-label="Search content pieces"
            className="pl-8"
          />
        </div>
        <div className="w-[160px] shrink-0">
          <Select
            value={stageFilter}
            onChange={(event) => setStageFilter(event.target.value)}
            aria-label="Filter by stage"
          >
            <option value="live">In production</option>
            {CONTENT_PIPELINE.map((stage) => (
              <option key={stage.key} value={stage.key}>
                {stage.label}
              </option>
            ))}
            <option value="all">Everything</option>
          </Select>
        </div>
        <div className="w-[150px] shrink-0">
          <Select
            value={platformFilter}
            onChange={(event) => setPlatformFilter(event.target.value)}
            aria-label="Filter by platform"
          >
            <option value="all">All platforms</option>
            {CONTENT_PLATFORMS.map((platform) => (
              <option key={platform.key} value={platform.key}>
                {platform.label}
              </option>
            ))}
          </Select>
        </div>
        <Button variant="primary" onClick={() => edit(null)} className="shrink-0">
          <Plus size={14} />
          Add piece
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)]">
          <EmptyState
            icon={<Clapperboard size={22} />}
            title={pieces.length === 0 ? "Nothing in the pipeline yet" : "Nothing matches that"}
            hint={
              pieces.length === 0
                ? "Drop every idea in as a concept. Script it, shoot it, cut it — the board walks each piece to posted."
                : "Try a different search, or widen the filter."
            }
            action={
              pieces.length === 0 ? (
                <Button variant="primary" onClick={() => edit(null)}>
                  <Plus size={14} />
                  Add your first idea
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.key}>
            <div className="mb-2.5 flex items-baseline gap-2.5">
              <h2 className="text-[13.5px] font-bold" style={{ color: group.tone }}>
                {group.label}
              </h2>
              <span className="tabular text-[12px] font-semibold text-[var(--color-ink-3)]">
                {group.pieces.length}
              </span>
              <span className="text-[11.5px] text-[var(--color-ink-3)]">{group.hint}</span>
            </div>

            <div className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {group.pieces.map((piece) => {
                const dimension = CONTENT_DIMENSION[piece.dimension];
                const dates = shootLine(piece, today);
                const words = piece.script
                  ? piece.script.trim().split(/\s+/).filter(Boolean).length
                  : 0;
                return (
                  <div
                    key={piece.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => edit(piece)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        edit(piece);
                      }
                    }}
                    className="lift group cursor-pointer overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] text-left"
                  >
                    {/* The stage's colour, along the top — same read as the board headers. */}
                    <div aria-hidden className="h-1.5 w-full" style={{ background: group.tone }} />

                    <div className="p-4">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="min-w-0 truncate text-[14.5px] font-bold tracking-tight">
                          {piece.title}
                        </span>
                        <Pencil
                          size={11}
                          aria-hidden
                          className="shrink-0 text-[var(--color-ink-3)] opacity-0 transition-opacity group-hover:opacity-100"
                        />
                      </div>

                      {piece.hook && (
                        <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-[var(--color-ink-2)]">
                          “{piece.hook}”
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <Chip tone="var(--color-ink-2)" title={CONTENT_PLATFORM[piece.platform].label}>
                          {CONTENT_PLATFORM[piece.platform].short}
                        </Chip>
                        <Chip tone={group.tone} title={`${dimension.label} — ${dimension.spec}`}>
                          <DimensionGlyph dimension={piece.dimension} />
                          {dimension.label.split(" · ")[0]}
                        </Chip>
                        {piece.editor && (piece.status === "editing" || piece.status === "shot") && (
                          <Chip tone="var(--color-series-3)" title="Who's cutting it">
                            {piece.editor}
                          </Chip>
                        )}
                      </div>

                      <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-[var(--color-line)] pt-2.5">
                        <div className="min-w-0 text-[11.5px]">
                          {dates && (
                            <p
                              className="truncate font-medium"
                              style={{
                                color: dates.late ? "var(--color-serious)" : "var(--color-ink-2)",
                              }}
                            >
                              {dates.text}
                            </p>
                          )}
                          <p className="truncate text-[var(--color-ink-3)]">
                            {words > 0 ? `Script · ${words} words` : "No script yet"}
                          </p>
                        </div>
                        {words > 0 && (
                          <Link
                            href={`/content/${piece.id}/script`}
                            onClick={(event) => event.stopPropagation()}
                            title="Open the script sheet — read, print or save as PDF"
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-[11.5px] font-semibold text-[var(--color-ink-2)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-ink)]"
                          >
                            <FileText size={12} />
                            Script
                          </Link>
                        )}
                      </div>

                      {CONTENT_STATUS[piece.status].advance && (
                        <div className="mt-2 -mx-1 flex justify-end border-t border-[var(--color-line)] pt-2">
                          <AdvanceButton piece={piece} action={advanceAction} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}

      <ContentEditor
        key={`${editing?.id ?? "new"}-${openedAt}`}
        open={open}
        onClose={() => setOpen(false)}
        piece={editing}
      />
    </>
  );
}
