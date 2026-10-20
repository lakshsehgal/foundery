"use client";

import { useActionState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { submitApplication, type ApplyState } from "@/app/actions/hiring";
import { Button, Field, Select, TextArea, TextInput } from "@/components/ui/form";
import { BASE_APPLICANT_FIELDS, RELOCATION, type Relocation } from "@/lib/hiring";
import type { OnboardingField } from "@/lib/taxonomy";

/**
 * The candidate's side: the fixed who-are-you block, the Delhi question, then
 * whatever questions this role declares. Same bones as the public onboarding
 * form — honeypot included — because the same bots find both.
 */
export function ApplyForm({ token, fields }: { token: string; fields: OnboardingField[] }) {
  const [state, action, pending] = useActionState<ApplyState, FormData>(submitApplication, {});

  if (state.done) {
    return (
      <div className="rise text-center">
        <div className="grid place-items-center">
          <span
            className="grid h-11 w-11 place-items-center rounded-full"
            style={{ background: "color-mix(in srgb, var(--color-good) 16%, transparent)" }}
          >
            <CheckCircle2 size={20} style={{ color: "var(--color-good)" }} />
          </span>
        </div>
        <h2 className="mt-4 text-[17px] font-semibold tracking-tight">Application in</h2>
        <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-[var(--color-ink-2)]">
          Thanks — the team reads every application. If there&apos;s a fit you&apos;ll hear from us
          on WhatsApp or email to set up a conversation.
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

      <div className="grid gap-4 sm:grid-cols-2">
        {BASE_APPLICANT_FIELDS.map((field) => (
          <Field
            key={field.key}
            label={field.required ? field.label : `${field.label} (optional)`}
            hint={"hint" in field ? field.hint : undefined}
            htmlFor={field.key}
          >
            <TextInput
              id={field.key}
              name={field.key}
              type={field.type === "text" ? "text" : field.type}
              required={field.required}
              autoComplete={
                field.key === "name" ? "name"
                : field.key === "email" ? "email"
                : field.key === "phone" ? "tel"
                : undefined
              }
            />
          </Field>
        ))}
        <Field
          label="The office is in Ghitorni, Delhi — where do you stand?"
          htmlFor="relocation"
        >
          <Select id="relocation" name="relocation" required defaultValue="">
            <option value="" disabled>
              Pick one
            </option>
            {(Object.keys(RELOCATION) as Relocation[]).map((key) => (
              <option key={key} value={key}>
                {RELOCATION[key].label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {fields.length > 0 && (
        <div className="space-y-5 border-t border-[var(--color-line)] pt-5">
          {fields.map((field) => (
            <Field
              key={field.key}
              label={field.required ? field.label : `${field.label} (optional)`}
              hint={field.hint}
              htmlFor={`q_${field.key}`}
            >
              {field.type === "textarea" ? (
                <TextArea id={`q_${field.key}`} name={`q_${field.key}`} rows={4} required={field.required} />
              ) : (
                <TextInput
                  id={`q_${field.key}`}
                  name={`q_${field.key}`}
                  type={field.type === "number" ? "text" : field.type}
                  inputMode={field.type === "number" ? "decimal" : undefined}
                  required={field.required}
                />
              )}
            </Field>
          ))}
        </div>
      )}

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
          Send my application
        </Button>
        <p className="text-[11.5px] text-[var(--color-ink-3)]">
          Nothing is sent until you press this.
        </p>
      </div>
    </form>
  );
}
