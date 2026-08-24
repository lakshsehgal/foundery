"use client";

import { useRouter, useSearchParams } from "next/navigation";

/**
 * Invoiced vs collected. They are different businesses in a month where a
 * client pays late, and the founder needs to be able to see which question
 * they're asking.
 */
export function BasisToggle({ basis }: { basis: "invoiced" | "collected" }) {
  const router = useRouter();
  const params = useSearchParams();

  function set(next: string) {
    const query = new URLSearchParams(params.toString());
    query.set("basis", next);
    router.push(`/pnl?${query.toString()}`);
  }

  return (
    <div
      role="group"
      aria-label="Revenue basis"
      className="flex items-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--color-line-strong)] p-0.5"
    >
      {(
        [
          ["invoiced", "Invoiced", "Counted when the invoice went out"],
          ["collected", "Collected", "Counted when the money landed"],
        ] as const
      ).map(([key, label, hint]) => (
        <button
          key={key}
          onClick={() => set(key)}
          title={hint}
          aria-pressed={basis === key}
          className={`rounded-[var(--radius-sm)] px-2.5 py-1 text-[12px] transition-colors ${
            basis === key
              ? "bg-[var(--color-surface-3)] font-semibold text-[var(--color-ink)]"
              : "text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)]"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
