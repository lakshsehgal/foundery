"use client";

import { useActionState, useState } from "react";
import {
  ArrowRight, Check, CheckCircle2, Copy, KeyRound, Package, Palette, Save, ShoppingBag, Star,
} from "lucide-react";
import { saveWelcomeAccess, submitWelcomeDetails, type WelcomeState } from "@/app/actions/onboarding";
import { Button, Field, TextArea, TextInput } from "@/components/ui/form";
import { ACCESS_NOTES_KEY, type OnboardingField } from "@/lib/taxonomy";
import type { GuidedOnboarding } from "@/lib/queries";

/** The flow's access groups with every "{value}" already substituted on the server. */
export type ResolvedAccessGroup = {
  key: string;
  label: string;
  value: string;
  highlight: { title: string; text: string } | null;
  banner: { text: string; tone: "info" | "good" } | null;
  items: { key: string; label: string; instruction: string; input: "url" | "text" | null }[];
};

export function DetailsStep({
  onboarding, fields,
}: {
  onboarding: GuidedOnboarding;
  fields: OnboardingField[];
}) {
  const [state, action, pending] = useActionState<WelcomeState, FormData>(submitWelcomeDetails, {});

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="token" value={onboarding.token} />

      {fields.map((field) => (
        <Field
          key={field.key}
          label={field.required ? field.label : `${field.label} (optional)`}
          hint={field.hint || undefined}
          htmlFor={`f_${field.key}`}
        >
          <TextInput
            id={`f_${field.key}`}
            name={`f_${field.key}`}
            type={field.type === "email" ? "email" : field.type === "url" ? "url" : "text"}
            required={field.required}
            defaultValue={onboarding.details[field.key] ?? ""}
          />
        </Field>
      ))}

      {state.error && (
        <p role="alert" className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-critical)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-critical)_10%,transparent)] px-3 py-2 text-[12.5px] text-[var(--color-critical)]">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3 border-t border-[var(--color-line)] pt-5">
        <Button type="submit" variant="primary" loading={pending}>
          {!pending && <ArrowRight size={14} />}
          Continue to accesses
        </Button>
        <p className="text-[11.5px] text-[var(--color-ink-3)]">Step 1 of 2</p>
      </div>
    </form>
  );
}

function CopyValueButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the value is on screen either way */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-[12.5px] font-semibold transition-colors hover:bg-[var(--color-surface-2)]"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/** Renders banner copy with the substituted value set in a code chip. */
function BannerText({ text, value }: { text: string; value: string }) {
  const parts = text.split("{value}");
  return (
    <>
      {parts.map((part, index) => (
        <span key={index}>
          {part}
          {index < parts.length - 1 && (
            <code className="rounded-[var(--radius-xs)] bg-[color-mix(in_srgb,currentColor_12%,transparent)] px-1.5 py-0.5 font-mono text-[12px] font-semibold">
              {value}
            </code>
          )}
        </span>
      ))}
    </>
  );
}

const GROUP_BADGE: Record<
  string,
  { tone: string; icon: "facebook" | "g" | "shopify" | "box" | "palette" }
> = {
  meta: { tone: "var(--color-series-1)", icon: "facebook" },
  google: { tone: "var(--color-critical)", icon: "g" },
  shopify: { tone: "var(--color-good)", icon: "shopify" },
  other: { tone: "var(--color-warning)", icon: "box" },
  brand: { tone: "var(--color-series-5)", icon: "palette" },
};

function GroupBadge({ groupKey }: { groupKey: string }) {
  const badge = GROUP_BADGE[groupKey] ?? GROUP_BADGE.other;
  return (
    <span
      aria-hidden
      className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[14px] font-bold"
      style={{
        background:
          badge.icon === "facebook"
            ? badge.tone
            : `color-mix(in srgb, ${badge.tone} 14%, transparent)`,
        color: badge.icon === "facebook" ? "#fff" : badge.tone,
      }}
    >
      {badge.icon === "facebook" && <span className="text-[15px] leading-none">f</span>}
      {badge.icon === "g" && "G"}
      {badge.icon === "shopify" && <ShoppingBag size={14} />}
      {badge.icon === "box" && <Package size={14} />}
      {badge.icon === "palette" && <Palette size={14} />}
    </span>
  );
}

export function AccessStep({
  onboarding, groups,
}: {
  onboarding: GuidedOnboarding;
  groups: ResolvedAccessGroup[];
}) {
  const [state, action, pending] = useActionState<WelcomeState, FormData>(saveWelcomeAccess, {});
  const items = groups.flatMap((group) => group.items);
  const doneCount = items.filter((item) => onboarding.access[item.key]?.done).length;

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="token" value={onboarding.token} />

      {/* ------------------------------------------------------- header */}
      <div>
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)]"
            style={{ background: "var(--color-brand)", color: "var(--color-brand-ink)" }}
          >
            <KeyRound size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[19px] font-bold tracking-tight">Platform Accesses</h2>
            <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--color-ink-2)]">
              Please grant us access to the following platforms to get started
            </p>
          </div>
          <p className="shrink-0 text-[20px] font-bold tabular">
            <span style={{ color: "var(--color-accent)" }}>{doneCount}</span>
            <span className="text-[14px] font-medium text-[var(--color-ink-3)]">/{items.length}</span>
          </p>
        </div>
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-3)]">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${(doneCount / items.length) * 100}%`,
              background: "var(--color-good)",
            }}
          />
        </div>
      </div>

      {/* ------------------------------------------------------- groups */}
      {groups.map((group) => (
        <section key={group.key} className="space-y-3">
          <h3 className="flex items-center gap-2.5 pt-1 text-[15px] font-bold tracking-tight">
            <GroupBadge groupKey={group.key} />
            {group.label}
          </h3>

          {group.highlight && (
            <div
              className="rounded-[var(--radius-md)] border p-4"
              style={{
                borderColor: "color-mix(in srgb, var(--color-brand) 55%, transparent)",
                background: "color-mix(in srgb, var(--color-brand) 8%, var(--color-surface))",
              }}
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-sm)]"
                  style={{ background: "var(--color-brand)", color: "var(--color-brand-ink)" }}
                >
                  <Star size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[14px] font-bold">
                    {group.highlight.title}
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em]"
                      style={{ background: "var(--color-brand)", color: "var(--color-brand-ink)" }}
                    >
                      Important
                    </span>
                  </p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">
                    {group.highlight.text}
                  </p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <span className="rounded-[var(--radius-sm)] bg-[var(--color-surface-3)] px-3 py-1.5 font-mono text-[14px] font-bold tabular tracking-wide">
                      {group.value}
                    </span>
                    <CopyValueButton value={group.value} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {group.banner && (
            <p
              className="rounded-[var(--radius-md)] border px-3.5 py-2.5 text-[12.5px] leading-relaxed"
              style={
                group.banner.tone === "good"
                  ? {
                      borderColor: "color-mix(in srgb, var(--color-good) 30%, transparent)",
                      background: "color-mix(in srgb, var(--color-good) 8%, transparent)",
                      color: "var(--color-good)",
                    }
                  : {
                      borderColor: "color-mix(in srgb, var(--color-series-1) 30%, transparent)",
                      background: "color-mix(in srgb, var(--color-series-1) 8%, transparent)",
                      color: "var(--color-series-1)",
                    }
              }
            >
              <BannerText text={group.banner.text} value={group.value} />
            </p>
          )}

          {group.items.map((item) => {
            const saved = onboarding.access[item.key];
            if (item.input) {
              // A handover, not a tick: it counts as done once it's filled in.
              return (
                <div
                  key={item.key}
                  className="rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] p-3.5"
                >
                  <Field label={item.label} hint={item.instruction} htmlFor={`val_${item.key}`}>
                    {item.input === "url" ? (
                      <TextInput
                        id={`val_${item.key}`}
                        name={`val_${item.key}`}
                        type="url"
                        placeholder="https://…"
                        defaultValue={saved?.note ?? ""}
                      />
                    ) : (
                      <TextArea
                        id={`val_${item.key}`}
                        name={`val_${item.key}`}
                        rows={3}
                        defaultValue={saved?.note ?? ""}
                      />
                    )}
                  </Field>
                </div>
              );
            }
            return (
              <label
                key={item.key}
                className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] p-3.5 transition-colors hover:bg-[var(--color-surface-2)]"
              >
                <input
                  type="checkbox"
                  name={`done_${item.key}`}
                  defaultChecked={saved?.done ?? false}
                  className="mt-[3px] h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold">{item.label}</span>
                  <span className="mt-0.5 block text-[12px] leading-relaxed text-[var(--color-ink-2)]">
                    {item.instruction}
                  </span>
                </span>
              </label>
            );
          })}
        </section>
      ))}

      {/* -------------------------------------------------------- notes */}
      <div className="rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] p-3.5">
        <Field label="Other Accesses / Notes" htmlFor="access_notes">
          <TextArea
            id="access_notes"
            name="access_notes"
            rows={3}
            defaultValue={onboarding.access[ACCESS_NOTES_KEY]?.note ?? ""}
            placeholder="Any additional platform accesses or notes…"
          />
        </Field>
      </div>

      {state.error && (
        <p role="alert" className="text-[12.5px] text-[var(--color-critical)]">{state.error}</p>
      )}

      <div className="flex items-center gap-3 border-t border-[var(--color-line)] pt-5">
        <Button type="submit" variant="primary" loading={pending}>
          {!pending && <Save size={14} />}
          Save accesses
        </Button>
        <p className="text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">
          Save as you go — once every box is ticked, you&apos;re fully onboarded.
        </p>
      </div>
    </form>
  );
}

export function DoneCard() {
  return (
    <div className="rise rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-8 text-center">
      <div className="grid place-items-center">
        <span
          className="grid h-12 w-12 place-items-center rounded-full"
          style={{ background: "color-mix(in srgb, var(--color-good) 16%, transparent)" }}
        >
          <CheckCircle2 size={22} style={{ color: "var(--color-good)" }} />
        </span>
      </div>
      <h2 className="mt-4 text-[18px] font-bold tracking-tight">You&apos;re fully onboarded</h2>
      <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-[var(--color-ink-2)]">
        Every access is in and the team has what it needs. Next stop: the kickoff call — we&apos;ll
        be in touch to book it.
      </p>
    </div>
  );
}
