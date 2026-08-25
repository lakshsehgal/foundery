"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Plug } from "lucide-react";
import { connectZohoAction } from "@/app/actions/zoho";
import type { ActionState } from "@/app/actions/clients";
import { Button, Field, TextInput } from "@/components/ui/form";
import { Card, CardTitle, Chip } from "@/components/ui/primitives";

export function ZohoConnectCard({ connected }: { connected: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(connectZohoAction, {});

  useEffect(() => {
    if (state.ok) toast.success(state.ok, { duration: 10000 });
    if (state.error) toast.error(state.error, { duration: 10000 });
  }, [state]);

  return (
    <Card>
      <CardTitle
        title="Zoho Books"
        hint="One-way sync: Zoho stays the system of record, Cortex mirrors the invoices nightly and on demand."
      >
        <Chip tone={connected ? "var(--color-good)" : "var(--color-ink-3)"} size="md">
          {connected ? "Connected" : "Not connected"}
        </Chip>
      </CardTitle>

      {connected ? (
        <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">
          Connected — the nightly sync runs at 8:00 IST, and the <b>Sync Zoho</b> button on the
          invoices page pulls on demand. To reconnect with fresh credentials, fill the form in
          again with a new grant code.
        </p>
      ) : (
        <p className="mb-4 text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">
          From{" "}
          <a href="https://api-console.zoho.in" target="_blank" rel="noreferrer" className="underline underline-offset-4">
            api-console.zoho.in
          </a>{" "}
          → your <b>Self Client</b>: copy the Client ID and Secret, then in <b>Generate Code</b>{" "}
          create a code with scope{" "}
          <code className="rounded-[var(--radius-xs)] bg-[var(--color-surface-3)] px-1 py-0.5 font-mono text-[11px]">
            ZohoBooks.invoices.READ
          </code>{" "}
          and paste all three below within 10 minutes. The exchange happens server-side and the
          connection is verified with an immediate first sync.
        </p>
      )}

      <form action={action} className={connected ? "mt-4 space-y-4" : "space-y-4"}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Client ID" htmlFor="zc_id">
            <TextInput id="zc_id" name="client_id" placeholder="1000.XXXXXXXX…" autoComplete="off" />
          </Field>
          <Field label="Client secret" htmlFor="zc_secret">
            <TextInput id="zc_secret" name="client_secret" type="password" autoComplete="off" />
          </Field>
          <Field label="Grant code" htmlFor="zc_code" hint="From the Generate Code tab — valid for 10 minutes.">
            <TextInput id="zc_code" name="grant_code" autoComplete="off" />
          </Field>
          <Field label="Organisation ID" htmlFor="zc_org">
            <TextInput id="zc_org" name="org_id" defaultValue="60040276521" />
          </Field>
        </div>
        <Button type="submit" variant="primary" loading={pending}>
          {!pending && <Plug size={14} />}
          Connect and run first sync
        </Button>
      </form>
    </Card>
  );
}
