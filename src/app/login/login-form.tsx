"use client";

import { useActionState } from "react";
import { ArrowRight } from "lucide-react";
import { signIn, type LoginState } from "@/app/actions/auth";
import { Button, Field, TextInput } from "@/components/ui/form";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});

  return (
    <form action={action}>
      <h2 className="text-[19px] font-semibold tracking-tight">Sign in</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-ink-2)]">
        One passcode each. What you see is decided by which one you use.
      </p>

      <Field label="Passcode" htmlFor="passcode" className="mt-7">
        <TextInput
          id="passcode"
          name="passcode"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          placeholder="••••••••••"
          aria-describedby={state.error ? "passcode-error" : undefined}
        />
      </Field>

      {state.error && (
        <p
          id="passcode-error"
          role="alert"
          className="mt-3 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-critical)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-critical)_10%,transparent)] px-3 py-2 text-[12.5px] text-[var(--color-critical)]"
        >
          {state.error}
        </p>
      )}

      <Button type="submit" variant="primary" loading={pending} className="mt-6 w-full">
        {!pending && <ArrowRight size={14} />}
        Sign in
      </Button>

      <p className="mt-8 text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">
        Sessions last 12 hours. Forgotten it? It lives in the environment file on the machine
        running this, not in a database — nobody can look it up for you.
      </p>
    </form>
  );
}
