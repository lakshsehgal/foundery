"use client";

import { useActionState } from "react";
import { ArrowRight, CheckCircle2, Save } from "lucide-react";
import { saveWelcomeAccess, submitWelcomeDetails, type WelcomeState } from "@/app/actions/onboarding";
import { Button, Field, TextInput } from "@/components/ui/form";
import { ONBOARDING_DETAIL_FIELDS, type AccessItem } from "@/lib/taxonomy";
import type { GuidedOnboarding } from "@/lib/queries";

export function DetailsStep({ onboarding }: { onboarding: GuidedOnboarding }) {
  const [state, action, pending] = useActionState<WelcomeState, FormData>(submitWelcomeDetails, {});

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="token" value={onboarding.token} />

      {ONBOARDING_DETAIL_FIELDS.map((field) => (
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

export function AccessStep({
  onboarding, items,
}: {
  onboarding: GuidedOnboarding;
  /** Server-resolved: hints already carry Neuroid's IDs where configured. */
  items: (AccessItem & { instruction: string })[];
}) {
  const [state, action, pending] = useActionState<WelcomeState, FormData>(saveWelcomeAccess, {});
  const doneCount = items.filter((item) => onboarding.access[item.key]?.done).length;

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={onboarding.token} />

      <div className="mb-1 flex items-center justify-between">
        <p className="text-[12.5px] font-medium text-[var(--color-ink-2)]">
          {doneCount} of {items.length} granted
        </p>
        <div className="h-2 w-40 overflow-hidden rounded-full bg-[var(--color-surface-3)]">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${(doneCount / items.length) * 100}%`,
              background: "var(--color-good)",
            }}
          />
        </div>
      </div>

      {items.map((item) => {
        const saved = onboarding.access[item.key];
        return (
          <div
            key={item.key}
            className="rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] p-3.5"
          >
            <label className="flex cursor-pointer items-start gap-3">
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
            <TextInput
              name={`note_${item.key}`}
              defaultValue={saved?.note ?? ""}
              placeholder="Anything we should know — account ID, who to chase, a blocker…"
              className="mt-2.5"
            />
          </div>
        );
      })}

      {state.error && (
        <p role="alert" className="text-[12.5px] text-[var(--color-critical)]">{state.error}</p>
      )}

      <div className="flex items-center gap-3 border-t border-[var(--color-line)] pt-5">
        <Button type="submit" variant="primary" loading={pending}>
          {!pending && <Save size={14} />}
          Save progress
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
