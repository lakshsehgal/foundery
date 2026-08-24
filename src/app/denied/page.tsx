import Link from "next/link";
import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { Logo } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Founder only" };

export default async function DeniedPage() {
  await requireRole();

  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-[26rem] text-center">
        <div className="mb-9 flex justify-center">
          <Logo size={26} />
        </div>

        <div className="grid place-items-center">
          <span
            className="grid h-11 w-11 place-items-center rounded-full"
            style={{ background: "var(--color-surface-3)" }}
          >
            <Lock size={17} className="text-[var(--color-ink-3)]" />
          </span>
        </div>

        <h1 className="mt-5 text-[19px] font-semibold tracking-tight">This one is founder only</h1>
        <p className="mx-auto mt-2 max-w-[22rem] text-[13px] leading-relaxed text-[var(--color-ink-2)]">
          Margins, profit and the P&amp;L sit behind the founder passcode. Everything you need to
          run the day — clients, costs, invoices and onboarding — is on the other pages.
        </p>

        <Link
          href="/"
          className="mt-7 inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3.5 py-2 text-[13px] font-medium shadow-[0_1px_2px_rgb(16_24_40/0.04)] transition-colors hover:bg-[var(--color-surface-2)]"
        >
          Back to today
        </Link>
      </div>
    </main>
  );
}
