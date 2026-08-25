"use client";

import { useActionState } from "react";
import { ArrowRight, KeyRound, Mail } from "lucide-react";
import { sendLoginCode, verifyLoginCode, type OtpState } from "@/app/actions/auth";
import { Button, Field, TextInput } from "@/components/ui/form";

const GOOGLE_ERRORS: Record<string, string> = {
  "not-on-team": "That Google account's email isn't on the team. Ask the founder to add you.",
  "google-failed": "Google sign-in didn't complete — try again.",
  "google-unavailable": "Google sign-in isn't enabled yet on this deployment.",
  "not-configured": "Sign-in isn't configured on this deployment.",
  "missing-code": "Google sign-in didn't complete — try again.",
};

function GoogleMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.5 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z" />
      <path fill="#FBBC05" d="M10.5 28.6a14.5 14.5 0 0 1 0-9.2l-7.9-6.2a24 24 0 0 0 0 21.6l7.9-6.2z" />
      <path fill="#34A853" d="M24 48c6.3 0 11.6-2.1 15.6-5.7l-7.7-6c-2.1 1.5-4.8 2.3-7.9 2.3-6.3 0-11.6-4-13.5-9.9l-7.9 6.2C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

export function OtpLoginForm({
  googleError, googleAvailable, emailAvailable, passcodeAvailable,
}: {
  googleError?: string;
  googleAvailable: boolean;
  emailAvailable: boolean;
  passcodeAvailable: boolean;
}) {
  const [sendState, sendAction, sending] = useActionState<OtpState, FormData>(sendLoginCode, {});
  const [verifyState, verifyAction, verifying] = useActionState<OtpState, FormData>(verifyLoginCode, {});

  const sentTo = verifyState.sentTo ?? sendState.sentTo;
  const error =
    verifyState.error ?? sendState.error ?? (googleError ? GOOGLE_ERRORS[googleError] : undefined);

  return (
    <div>
      <h2 className="text-[19px] font-semibold tracking-tight">Sign in</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-ink-2)]">
        No passwords here — your email is the key. What you see inside is decided by who you are.
      </p>

      {googleAvailable && (
        <a
          href="/auth/google"
          className="mt-7 flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3.5 py-2.5 text-[13.5px] font-medium shadow-[0_1px_2px_rgb(16_24_40/0.04)] transition-colors hover:bg-[var(--color-surface-2)]"
        >
          <GoogleMark />
          Continue with Google
        </a>
      )}

      {googleAvailable && emailAvailable && (
        <div className="my-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-[var(--color-line)]" />
          <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--color-ink-3)]">
            or email me a code
          </span>
          <span className="h-px flex-1 bg-[var(--color-line)]" />
        </div>
      )}

      {!emailAvailable ? (
        <p className={`${googleAvailable ? "" : "mt-7 "}rounded-[var(--radius-md)] bg-[var(--color-surface-2)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--color-ink-2)]`}>
          Email codes aren&apos;t set up yet — the founder adds a Resend API key under Settings →
          Email to switch them on.
        </p>
      ) : !sentTo ? (
        <form action={sendAction}>
          <Field label="Work email" htmlFor="email">
            <TextInput
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@neuroidmedia.com"
            />
          </Field>
          <Button type="submit" variant="primary" loading={sending} className="mt-4 w-full">
            {!sending && <Mail size={14} />}
            Send me a code
          </Button>
        </form>
      ) : (
        <form action={verifyAction}>
          <input type="hidden" name="email" value={sentTo} />
          <Field
            label={`Code sent to ${sentTo}`}
            htmlFor="code"
            hint="Six digits, in your inbox. Check spam if it's shy."
          >
            <TextInput
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              required
              autoFocus
              placeholder="123456"
              className="text-center text-[18px] font-bold tracking-[0.3em]"
            />
          </Field>
          <Button type="submit" variant="primary" loading={verifying} className="mt-4 w-full">
            {!verifying && <ArrowRight size={14} />}
            Sign in
          </Button>
        </form>
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-critical)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-critical)_10%,transparent)] px-3 py-2 text-[12.5px] text-[var(--color-critical)]"
        >
          {error}
        </p>
      )}

      <p className="mt-8 flex items-start gap-2 text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">
        <KeyRound size={12} className="mt-[2px] shrink-0" aria-hidden />
        Only emails the founder has put on the team list can get in — founder and operator each see
        their own view. Sessions last 12 hours.
      </p>

      {passcodeAvailable && (
        <p className="mt-3 text-[11.5px] text-[var(--color-ink-3)]">
          Stuck?{" "}
          <a href="/login?method=passcode" className="underline underline-offset-4">
            Sign in with a passcode instead
          </a>
          .
        </p>
      )}
    </div>
  );
}
