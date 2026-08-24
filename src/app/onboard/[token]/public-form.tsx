"use client";

import { useActionState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { submitOnboarding, type SubmitState } from "@/app/actions/onboarding";
import { Button, Field, TextArea, TextInput } from "@/components/ui/form";
import type { OnboardingField } from "@/lib/taxonomy";

export function PublicForm({ token, fields }: { token: string; fields: OnboardingField[] }) {
  const [state, action, pending] = useActionState<SubmitState, FormData>(submitOnboarding, {});

  if (state.done) {
    return (
      <div className="rise rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-8 text-center">
        <div className="grid place-items-center">
          <span
            className="grid h-11 w-11 place-items-center rounded-full"
            style={{ background: "color-mix(in srgb, var(--color-good) 16%, transparent)" }}
          >
            <CheckCircle2 size={20} style={{ color: "var(--color-good)" }} />
          </span>
        </div>
        <h2 className="mt-4 text-[17px] font-semibold tracking-tight">That&apos;s us sorted</h2>
        <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-[var(--color-ink-2)]">
          Your answers are with the team. Someone will be in touch to book the kickoff — you
          don&apos;t need to do anything else.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="token" value={token} />

      {/* A field no person can see or tab into. Bots fill it; humans don't. */}
      <div aria-hidden className="absolute h-0 w-0 overflow-hidden opacity-0">
        <label htmlFor="company_website_confirm">Leave this empty</label>
        <input
          id="company_website_confirm"
          name="company_website_confirm"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      {fields.map((field) => (
        <Field
          key={field.key}
          label={field.required ? field.label : `${field.label} (optional)`}
          hint={field.hint}
          htmlFor={`f_${field.key}`}
        >
          {field.type === "textarea" ? (
            <TextArea id={`f_${field.key}`} name={`f_${field.key}`} rows={3} required={field.required} />
          ) : (
            <TextInput
              id={`f_${field.key}`}
              name={`f_${field.key}`}
              type={field.type === "number" ? "text" : field.type}
              inputMode={field.type === "number" ? "decimal" : undefined}
              required={field.required}
            />
          )}
        </Field>
      ))}

      {state.error && (
        <p
          role="alert"
          className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-critical)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-critical)_10%,transparent)] px-3 py-2 text-[12.5px] text-[var(--color-critical)]"
        >
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3 border-t border-[var(--color-line)] pt-5">
        <Button type="submit" variant="primary" loading={pending}>
          {!pending && <Send size={14} />}
          Send it over
        </Button>
        <p className="text-[11.5px] text-[var(--color-ink-3)]">
          Nothing is saved until you press send.
        </p>
      </div>
    </form>
  );
}
