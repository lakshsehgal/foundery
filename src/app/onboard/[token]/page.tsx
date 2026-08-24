import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getFormByToken } from "@/lib/queries";
import { Logo } from "@/components/ui/primitives";
import { PublicForm } from "./public-form";

export const dynamic = "force-dynamic";

/** Public page — keep it out of search results. */
export const metadata: Metadata = {
  title: "Client onboarding",
  robots: { index: false, follow: false },
};

export default async function PublicOnboardingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const form = getFormByToken(token);
  if (!form) notFound();

  return (
    <main className="min-h-dvh bg-[var(--color-canvas)]">
      <header className="border-b border-[var(--color-line)] bg-[var(--color-surface)] px-6 py-4">
        <div className="mx-auto max-w-[42rem]">
          <Logo size={24} />
        </div>
      </header>

      <div className="mx-auto max-w-[42rem] px-6 py-10 sm:py-14">
        <p
          className="text-[11.5px] font-medium uppercase tracking-[0.18em]"
          style={{ color: "var(--color-ink-3)" }}
        >
          Client onboarding
        </p>
        <h1 className="mt-3 text-[26px] font-semibold leading-tight tracking-tight sm:text-[30px]">
          {form.title}
        </h1>
        {form.intro && (
          <p className="mt-4 max-w-[34rem] text-[14px] leading-relaxed text-[var(--color-ink-2)]">
            {form.intro}
          </p>
        )}

        <div className="mt-9">
          {form.status === "closed" ? (
            <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-8 text-center">
              <h2 className="text-[16px] font-semibold tracking-tight">This form is closed</h2>
              <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-[var(--color-ink-2)]">
                Ask your contact at Neuroid for a fresh link and they&apos;ll send one over.
              </p>
            </div>
          ) : (
            <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-6 sm:p-8">
              <PublicForm token={form.token} fields={form.fields} />
            </div>
          )}
        </div>

        <p className="mt-8 text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">
          Sent to you by Neuroid Media. Your answers go straight to the team working on your account
          and nowhere else.
        </p>
      </div>
    </main>
  );
}
