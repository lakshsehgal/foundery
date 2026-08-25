"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { saveResend } from "@/app/actions/team";
import type { ActionState } from "@/app/actions/clients";
import { Button, Field, TextInput } from "@/components/ui/form";
import { Card, CardTitle, Chip } from "@/components/ui/primitives";

export function ResendCard({
  connected, founderEmail,
}: {
  connected: boolean;
  founderEmail: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveResend, {});

  useEffect(() => {
    if (state.ok) toast.success(state.ok, { duration: 8000 });
    if (state.error) toast.error(state.error, { duration: 8000 });
  }, [state]);

  return (
    <Card>
      <CardTitle
        title="Email — Resend"
        hint="Delivers the sign-in codes. Codes only, never links — nothing to misclick."
      >
        <Chip tone={connected ? "var(--color-good)" : "var(--color-ink-3)"} size="md">
          {connected ? "Connected" : "Not connected"}
        </Chip>
      </CardTitle>

      {!connected && (
        <p className="mb-4 text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">
          Create a key at{" "}
          <a href="https://resend.com/api-keys" target="_blank" rel="noreferrer" className="underline underline-offset-4">
            resend.com → API Keys
          </a>{" "}
          and paste it here. Until you verify your domain in Resend, leave the from-address as the
          default — it delivers to your own inbox, enough to sign in yourself. Verify{" "}
          <b>neuroidmedia.com</b> under Resend → Domains (two DNS records) and set the from-address
          to something like <b>Cortex &lt;cortex@neuroidmedia.com&gt;</b> to reach the operator
          too.
        </p>
      )}

      <form action={action} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Resend API key" htmlFor="re_key">
            <TextInput id="re_key" name="api_key" type="password" placeholder="re_…" autoComplete="off" />
          </Field>
          <Field
            label="From address"
            htmlFor="re_from"
            hint="Needs a domain verified in Resend; blank = Resend's test sender."
          >
            <TextInput id="re_from" name="from" placeholder="Cortex <cortex@neuroidmedia.com>" />
          </Field>
        </div>
        <Field
          label="Send a test email to"
          htmlFor="re_test"
          hint="Optional — proves delivery before anyone relies on it."
        >
          <TextInput id="re_test" name="test_to" type="email" defaultValue={founderEmail} />
        </Field>
        <Button type="submit" variant="primary" loading={pending}>
          {!pending && <Mail size={14} />}
          {connected ? "Update and test" : "Connect and test"}
        </Button>
      </form>
    </Card>
  );
}
