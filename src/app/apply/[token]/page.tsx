import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Briefcase, MapPin } from "lucide-react";
import { getJobRoleByToken } from "@/lib/queries";
import { EMPLOYMENT } from "@/lib/hiring";
import { Logo } from "@/components/ui/primitives";
import { ApplyForm } from "./apply-form";

export const dynamic = "force-dynamic";

/** Public page — shared with candidates, but kept out of search results. */
export const metadata: Metadata = {
  title: "Careers at Neuroid",
  robots: { index: false, follow: false },
};

export default async function ApplyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const role = await getJobRoleByToken(token);
  if (!role) notFound();

  return (
    <main className="min-h-dvh bg-[var(--color-canvas)]">
      <header className="border-b border-[var(--color-line)] bg-[var(--color-surface)] px-6 py-4">
        <div className="mx-auto flex max-w-[44rem] items-center justify-between">
          <Logo size={24} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-3)]">
            Careers
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-[44rem] px-6 py-10 sm:py-14">
        <p className="text-[11.5px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-3)]">
          We&apos;re hiring
        </p>
        <h1 className="mt-3 text-[26px] font-bold leading-tight tracking-tight sm:text-[32px]">
          {role.title}
        </h1>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] font-medium text-[var(--color-ink-2)]">
          <span className="inline-flex items-center gap-1.5">
            <Briefcase size={13} aria-hidden className="text-[var(--color-ink-3)]" />
            {EMPLOYMENT[role.employment]}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin size={13} aria-hidden className="text-[var(--color-ink-3)]" />
            {role.location}
          </span>
        </div>

        {role.pitch && (
          <p className="mt-5 max-w-[38rem] text-[14px] leading-relaxed text-[var(--color-ink-2)]">
            {role.pitch}
          </p>
        )}

        <div
          className="mt-5 max-w-[38rem] rounded-[var(--radius-md)] px-4 py-3 text-[12.5px] leading-relaxed"
          style={{
            background: "color-mix(in srgb, var(--color-brand) 14%, transparent)",
            color: "var(--color-ink)",
          }}
        >
          <strong className="font-semibold">Heads up on location:</strong> our office is in
          Ghitorni, New Delhi, and this role works from it. You should be based in Delhi NCR or
          ready to relocate.
        </div>

        <div className="mt-9">
          {role.status === "closed" ? (
            <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-8 text-center">
              <h2 className="text-[16px] font-semibold tracking-tight">
                Applications for this role have closed
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-[var(--color-ink-2)]">
                Thanks for the interest — follow Neuroid to catch the next opening.
              </p>
            </div>
          ) : (
            <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-6 sm:p-8">
              <ApplyForm token={role.token} fields={role.fields} />
            </div>
          )}
        </div>

        <p className="mt-8 text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">
          Neuroid Media · Ghitorni, New Delhi. Your application goes straight to the team doing the
          hiring and nowhere else.
        </p>
      </div>
    </main>
  );
}
