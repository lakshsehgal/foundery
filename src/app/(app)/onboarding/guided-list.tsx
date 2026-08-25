"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, Copy, ExternalLink } from "lucide-react";
import { Card, Chip, SectionLabel } from "@/components/ui/primitives";
import {
  ACCESS_NOTES_KEY, ONBOARDING_FLOWS, ONBOARDING_STATUS, accessItemsFor, detailFieldsFor,
} from "@/lib/taxonomy";
import type { GuidedOnboarding } from "@/lib/queries";

export function GuidedList({
  onboardings, urls,
}: {
  onboardings: GuidedOnboarding[];
  urls: Record<number, string>;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  async function copy(id: number, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      toast.success("Link copied.");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Couldn't copy — select the link text instead.");
    }
  }

  return (
    <div className="space-y-3">
      {onboardings.map((onboarding) => {
        const status = ONBOARDING_STATUS[onboarding.status];
        const accessItems = accessItemsFor(onboarding.flow);
        const detailFields = detailFieldsFor(onboarding.flow);
        const required = accessItems.filter((item) => !item.optional);
        const doneCount = required.filter((item) => onboarding.access[item.key]?.done).length;
        const isOpen = expanded === onboarding.id;

        return (
          <Card key={onboarding.id} padded={false}>
            <button
              onClick={() => setExpanded(isOpen ? null : onboarding.id)}
              className="flex w-full flex-wrap items-center gap-3 p-4 text-left"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold">{onboarding.client_name}</p>
                <p className="mt-0.5 text-[11.5px] text-[var(--color-ink-3)]">
                  Accesses: {doneCount}/{required.length} · started{" "}
                  {onboarding.created_at.slice(0, 10)}
                </p>
              </div>
              <Chip tone="var(--color-series-3)">{ONBOARDING_FLOWS[onboarding.flow].short}</Chip>
              <Chip tone={status.tone} size="md">{status.label}</Chip>
              <ChevronDown
                size={15}
                className={`shrink-0 text-[var(--color-ink-3)] transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </button>

            {isOpen && (
              <div className="rise border-t border-[var(--color-line)] p-4">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 truncate rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] px-2.5 py-1.5 font-mono text-[11.5px] text-[var(--color-ink-2)] select-all">
                    {urls[onboarding.id]}
                  </p>
                  <button
                    onClick={() => copy(onboarding.id, urls[onboarding.id])}
                    className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] px-2.5 py-1.5 text-[12px] font-medium transition-colors hover:bg-[var(--color-surface-2)]"
                  >
                    {copiedId === onboarding.id ? <Check size={12} /> : <Copy size={12} />}
                    Copy
                  </button>
                  <a
                    href={urls[onboarding.id]}
                    target="_blank"
                    rel="noreferrer"
                    className="grid h-8 w-8 place-items-center rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
                    aria-label="Open the client's view"
                  >
                    <ExternalLink size={13} />
                  </a>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <div>
                    <SectionLabel className="mb-2.5">Their details</SectionLabel>
                    {Object.keys(onboarding.details).length === 0 ? (
                      <p className="text-[12.5px] text-[var(--color-ink-3)]">
                        Nothing submitted yet — they haven&apos;t opened the link, or haven&apos;t
                        finished step 1.
                      </p>
                    ) : (
                      <dl className="space-y-2.5">
                        {detailFields.map((field) => {
                          const answer = onboarding.details[field.key];
                          if (!answer) return null;
                          return (
                            <div key={field.key}>
                              <dt className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
                                {field.label}
                              </dt>
                              <dd className="mt-0.5 break-words text-[13px]">
                                {field.type === "url" ? (
                                  <a href={answer} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                                    {answer}
                                  </a>
                                ) : (
                                  answer
                                )}
                              </dd>
                            </div>
                          );
                        })}
                      </dl>
                    )}
                  </div>

                  <div>
                    <SectionLabel className="mb-2.5">Accesses</SectionLabel>
                    <ul className="space-y-2">
                      {accessItems.map((item) => {
                        const entry = onboarding.access[item.key];
                        return (
                          <li key={item.key} className="flex items-start gap-2.5">
                            <span
                              aria-hidden
                              className="mt-[3px] grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] font-bold"
                              style={
                                entry?.done
                                  ? { background: "var(--color-good)", color: "#fff" }
                                  : { background: "var(--color-surface-3)", color: "var(--color-ink-3)" }
                              }
                            >
                              {entry?.done ? "✓" : ""}
                            </span>
                            <span className="min-w-0">
                              <span className={`block text-[12.5px] ${entry?.done ? "" : "text-[var(--color-ink-2)]"}`}>
                                {item.label}
                                {item.optional && (
                                  <span className="text-[var(--color-ink-3)]"> (optional)</span>
                                )}
                              </span>
                              {entry?.note &&
                                (item.input === "url" ? (
                                  <a
                                    href={entry.note}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block truncate text-[11.5px] underline underline-offset-4"
                                  >
                                    {entry.note}
                                  </a>
                                ) : (
                                  <span className="block text-[11.5px] text-[var(--color-ink-3)]">
                                    “{entry.note}”
                                  </span>
                                ))}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    {onboarding.access[ACCESS_NOTES_KEY]?.note && (
                      <p className="mt-3 rounded-[var(--radius-md)] bg-[var(--color-surface-2)] px-3 py-2 text-[12px] leading-relaxed text-[var(--color-ink-2)]">
                        <span className="font-semibold">Their notes: </span>
                        {onboarding.access[ACCESS_NOTES_KEY].note}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
