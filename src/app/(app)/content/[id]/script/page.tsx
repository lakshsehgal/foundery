import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { getContentPiece } from "@/lib/queries";
import { prettyDate } from "@/lib/dates";
import { PageBody, PageHeader, SectionLabel } from "@/components/ui/primitives";
import { CONTENT_DIMENSION, CONTENT_PLATFORM, CONTENT_STATUS } from "@/lib/taxonomy";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Script sheet" };
export const dynamic = "force-dynamic";

/**
 * The script as a sheet: what gets read off-camera on shoot day, and what
 * "print" prints. The chrome (header, sidebar) hides itself under @media
 * print, so the browser's Save-as-PDF is the PDF export.
 */
export default async function ScriptSheetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole();

  const { id } = await params;
  const piece = await getContentPiece(Number(id));
  if (!piece) notFound();

  const dimension = CONTENT_DIMENSION[piece.dimension];
  const words = piece.script ? piece.script.trim().split(/\s+/).filter(Boolean).length : 0;
  // ~150 spoken words a minute — the sanity check for a sub-60s piece.
  const seconds = Math.round(words / 2.5);

  const facts: { label: string; value: string }[] = [
    { label: "Platform", value: CONTENT_PLATFORM[piece.platform].label },
    { label: "Dimension", value: `${dimension.label} — ${dimension.spec}` },
    { label: "Shoot date", value: prettyDate(piece.shoot_date) },
    { label: "Post date", value: prettyDate(piece.post_date) },
    { label: "Editor", value: piece.editor ?? "—" },
    {
      label: "Length",
      value: words > 0 ? `${words} words · ~${seconds}s spoken` : "No script yet",
    },
  ];

  return (
    <>
      <PageHeader
        title={piece.title}
        subtitle={`Script sheet · ${CONTENT_STATUS[piece.status].label}`}
      >
        <Link
          href="/content"
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-[12.5px] font-medium transition-colors hover:bg-[var(--color-surface-2)]"
        >
          <ArrowLeft size={13} />
          Back to the board
        </Link>
        <PrintButton />
      </PageHeader>

      <PageBody width={780}>
        <article className="sheet rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-8 print:rounded-none print:border-0 print:p-0">
          <header className="border-b-2 border-[var(--color-ink)] pb-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-ink-3)]">
              Script sheet · {CONTENT_STATUS[piece.status].label}
            </p>
            <h1 className="mt-2 text-[26px] font-bold leading-tight tracking-tight">
              {piece.title}
            </h1>
            {piece.hook && (
              <p className="display mt-2 text-[17px] leading-snug text-[var(--color-ink-2)]">
                “{piece.hook}”
              </p>
            )}
          </header>

          {/* The brief, brief-style: label over value, scannable in a glance
              on a phone propped behind the camera. */}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-b border-[var(--color-line)] py-5 sm:grid-cols-3">
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt>
                  <SectionLabel>{fact.label}</SectionLabel>
                </dt>
                <dd className="mt-1 text-[13px] font-medium leading-snug">{fact.value}</dd>
              </div>
            ))}
          </dl>

          {piece.shoot_notes && (
            <div className="border-b border-[var(--color-line)] py-5">
              <SectionLabel>Shoot notes</SectionLabel>
              <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-relaxed">
                {piece.shoot_notes}
              </p>
            </div>
          )}

          <div className="py-5">
            <SectionLabel>Script</SectionLabel>
            {piece.script ? (
              <p className="mt-3 whitespace-pre-wrap text-[16px] leading-[1.85]">
                {piece.script}
              </p>
            ) : (
              <p className="mt-3 text-[13.5px] text-[var(--color-ink-3)]">
                Nothing written yet — open the piece on the board and script it there.
              </p>
            )}
          </div>

          {piece.notes && (
            <div className="border-t border-[var(--color-line)] pt-5">
              <SectionLabel>Notes</SectionLabel>
              <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--color-ink-2)]">
                {piece.notes}
              </p>
            </div>
          )}
        </article>
      </PageBody>
    </>
  );
}
