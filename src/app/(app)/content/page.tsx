import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { listContentPieces } from "@/lib/queries";
import { todayISO } from "@/lib/dates";
import { PageBody, PageHeader } from "@/components/ui/primitives";
import { ContentView } from "./content-view";

export const metadata: Metadata = { title: "Content" };
export const dynamic = "force-dynamic";

/**
 * The personal-brand pipeline. Every piece moves concept → scripting →
 * shoot due → shot → in edit → ready → posted, and the board reads in
 * that order — what needs a script, what needs a camera, what's with the
 * editor, all at a glance.
 */
export default async function ContentPage() {
  await requireRole();
  const pieces = await listContentPieces();
  const today = todayISO();

  const live = pieces.filter((piece) => piece.status !== "posted");
  const shootsDue = pieces.filter(
    (piece) => piece.status === "shoot_due" && piece.shoot_date && piece.shoot_date <= today,
  ).length;
  const inEdit = pieces.filter((piece) => piece.status === "editing").length;

  const subtitle = [
    `${live.length} in the pipeline`,
    shootsDue > 0 ? `${shootsDue} shoot${shootsDue === 1 ? "" : "s"} due` : null,
    inEdit > 0 ? `${inEdit} in edit` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <PageHeader title="Content" subtitle={subtitle || "Personal brand pipeline"} />
      <PageBody width={1120}>
        <ContentView pieces={pieces} today={today} />
      </PageBody>
    </>
  );
}
