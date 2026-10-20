import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import {
  ensureStarterRoles, listJobApplicants, listJobRoles, publicApplyUrl,
} from "@/lib/queries";
import { PageBody, PageHeader } from "@/components/ui/primitives";
import { HiringView } from "./hiring-view";

export const metadata: Metadata = { title: "Hiring" };
export const dynamic = "force-dynamic";

export default async function HiringPage() {
  const role = await requireRole();
  // First visit against a fresh database plants the four starter roles, each
  // with its own fresh public token; after that this is a no-op.
  await ensureStarterRoles();
  const [roles, applicants] = await Promise.all([listJobRoles(), listJobApplicants()]);

  const links: Record<number, string> = {};
  for (const jobRole of roles) links[jobRole.id] = publicApplyUrl(jobRole.token);

  const open = roles.filter((jobRole) => jobRole.status === "open").length;
  const fresh = applicants.filter((applicant) => applicant.stage === "applied").length;

  return (
    <>
      <PageHeader
        title="Hiring"
        subtitle={`${open} role${open === 1 ? "" : "s"} open · ${applicants.length} applicant${
          applicants.length === 1 ? "" : "s"
        }${fresh > 0 ? ` · ${fresh} unreviewed` : ""}`}
      />
      <PageBody width={1120}>
        <HiringView
          roles={roles}
          applicants={applicants}
          links={links}
          isFounder={role === "founder"}
        />
      </PageBody>
    </>
  );
}
