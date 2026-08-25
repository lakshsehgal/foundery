import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getGuidedByToken } from "@/lib/queries";
import { getSettings } from "@/lib/db";
import { accessGroupsFor, detailFieldsFor } from "@/lib/taxonomy";
import { Logo } from "@/components/ui/primitives";
import { AccessStep, DetailsStep, DoneCard, type ResolvedAccessGroup } from "./welcome-flow";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Welcome to Neuroid",
  robots: { index: false, follow: false },
};

const STEPS = [
  { key: "invited", label: "Your details" },
  { key: "details_done", label: "Accesses" },
  { key: "completed", label: "Done" },
] as const;

export default async function WelcomePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const onboarding = await getGuidedByToken(token);
  if (!onboarding) notFound();

  // Fold Neuroid's own IDs into every hint and banner, so the client sees
  // "share to our BM ID: 1100…" rather than a hunt. Settings override the
  // built-in defaults per group.
  const settings = await getSettings();
  const groups: ResolvedAccessGroup[] = accessGroupsFor(onboarding.flow).map((group) => {
    const value = group.settingKey
      ? settings.get(group.settingKey) || group.settingDefault || ""
      : "";
    return {
      key: group.key,
      label: group.label,
      value,
      highlight: group.highlight ?? null,
      banner: group.banner ?? null,
      items: group.items.map((item) => ({
        key: item.key,
        label: item.label,
        instruction: item.hint.replaceAll("{value}", value),
        input: item.input ?? null,
      })),
    };
  });
  const detailFields = detailFieldsFor(onboarding.flow).map((field) => ({ ...field }));

  const stepIndex = onboarding.status === "invited" ? 0 : onboarding.status === "details_done" ? 1 : 2;

  return (
    <main className="min-h-dvh bg-[var(--color-canvas)]">
      <header className="border-b border-[var(--color-line)] bg-[var(--color-surface)] px-6 py-4">
        <div className="mx-auto max-w-[44rem]">
          <Logo size={24} />
        </div>
      </header>

      <div className="mx-auto max-w-[44rem] px-6 py-10 sm:py-14">
        <p className="text-[11.5px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-3)]">
          Client onboarding
        </p>
        <h1 className="mt-3 text-[26px] font-bold leading-tight tracking-tight sm:text-[30px]">
          Hello, <span className="display font-normal">{onboarding.client_name}</span> 👋
        </h1>
        <p className="mt-3 max-w-[36rem] text-[14px] leading-relaxed text-[var(--color-ink-2)]">
          {stepIndex === 0 &&
            "Two short steps and your account is fully set up. First, the basics — this takes about three minutes."}
          {stepIndex === 1 &&
            "Details received — thank you. Now the accesses: grant each one below, tick it off, and save. Do them in any order, in as many sittings as you need."}
          {stepIndex === 2 && "All done — here's where things stand."}
        </p>

        {/* Step rail */}
        <ol className="mt-7 flex items-center gap-2">
          {STEPS.map((step, index) => (
            <li key={step.key} className="flex items-center gap-2">
              <span
                className="grid h-6 w-6 place-items-center rounded-full text-[11.5px] font-bold"
                style={
                  index <= stepIndex
                    ? { background: "var(--color-brand)", color: "var(--color-brand-ink)" }
                    : { background: "var(--color-surface-3)", color: "var(--color-ink-3)" }
                }
              >
                {index + 1}
              </span>
              <span
                className={`text-[12px] ${
                  index <= stepIndex
                    ? "font-semibold text-[var(--color-ink)]"
                    : "text-[var(--color-ink-3)]"
                }`}
              >
                {step.label}
              </span>
              {index < STEPS.length - 1 && (
                <span aria-hidden className="mx-1 h-px w-6 bg-[var(--color-line-strong)]" />
              )}
            </li>
          ))}
        </ol>

        <div className="mt-8">
          {stepIndex === 2 ? (
            <DoneCard />
          ) : (
            <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-6 sm:p-8">
              {stepIndex === 0 ? (
                <DetailsStep onboarding={onboarding} fields={detailFields} />
              ) : (
                <AccessStep onboarding={onboarding} groups={groups} />
              )}
            </div>
          )}
        </div>

        <p className="mt-8 text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">
          This link is personal to {onboarding.client_name} — please don&apos;t forward it outside
          your team. Your answers go straight to the people working on your account.
        </p>
      </div>
    </main>
  );
}
