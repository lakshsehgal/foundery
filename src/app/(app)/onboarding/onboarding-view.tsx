"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, FileText, Pencil, Plus, RefreshCw } from "lucide-react";
import { rotateFormLink } from "@/app/actions/onboarding";
import type { ActionState } from "@/app/actions/clients";
import { Button } from "@/components/ui/form";
import { Card, Chip, EmptyState } from "@/components/ui/primitives";
import type { FormView } from "@/lib/queries";
import type { OnboardingField } from "@/lib/taxonomy";
import { FormEditor } from "./form-editor";

function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied. Paste it straight into the email.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked outside a secure context — say so rather than
      // failing silently, and leave the text selectable so they can copy it.
      toast.error("Couldn't copy automatically. Select the link and copy it.");
    }
  }

  return (
    <Button size="sm" onClick={copy}>
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? "Copied" : "Copy link"}
    </Button>
  );
}

function RotateButton({ id }: { id: number }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(rotateFormLink, {});

  useEffect(() => {
    if (state.ok) toast.success(state.ok);
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={action} className="inline">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        title="Generate a new link and kill the old one"
        aria-label="Generate a new link"
        onClick={(event) => {
          if (!window.confirm("Generate a new link? Anyone holding the old one loses access immediately.")) {
            event.preventDefault();
          }
        }}
        className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-ink)] disabled:opacity-50"
      >
        <RefreshCw size={13} />
      </button>
    </form>
  );
}

export function OnboardingView({
  forms, urls, clients, starterFields,
}: {
  forms: FormView[];
  urls: Record<number, string>;
  clients: { id: number; name: string }[];
  starterFields: OnboardingField[];
}) {
  const [editing, setEditing] = useState<FormView | null>(null);
  const [open, setOpen] = useState(false);

  function edit(form: FormView | null) {
    setEditing(form);
    setOpen(true);
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12.5px] text-[var(--color-ink-3)]">
          {forms.length} form{forms.length === 1 ? "" : "s"}
        </p>
        <Button variant="primary" onClick={() => edit(null)}>
          <Plus size={14} />
          New form
        </Button>
      </div>

      {forms.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileText size={22} />}
            title="No onboarding forms yet"
            hint="Build one and you get a public link to send a new client. They fill it in without an account, and the answers land here."
            action={
              <Button variant="primary" onClick={() => edit(null)}>
                <Plus size={14} />
                Build the first one
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {forms.map((form) => (
            <Card key={form.id}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h2 className="min-w-0 truncate text-[14px] font-semibold">{form.title}</h2>
                    <Chip
                      tone={form.status === "open" ? "var(--color-good)" : "var(--color-ink-3)"}
                    >
                      {form.status === "open" ? "Open" : "Closed"}
                    </Chip>
                    {form.client_name && <Chip tone="var(--color-series-1)">{form.client_name}</Chip>}
                  </div>
                  <p className="mt-1 text-[11.5px] text-[var(--color-ink-3)]">
                    {form.fields.length} question{form.fields.length === 1 ? "" : "s"} ·{" "}
                    {form.submissions} {form.submissions === 1 ? "reply" : "replies"}
                    {form.lastSubmission ? ` · last ${form.lastSubmission.slice(0, 10)}` : ""}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <CopyLink url={urls[form.id]} />
                  <a
                    href={`/onboard/${form.token}`}
                    target="_blank"
                    rel="noreferrer"
                    title="Open the client's view"
                    aria-label="Open the client's view"
                    className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-ink)]"
                  >
                    <ExternalLink size={13} />
                  </a>
                  <RotateButton id={form.id} />
                  <button
                    onClick={() => edit(form)}
                    title="Edit the questions"
                    aria-label={`Edit ${form.title}`}
                    className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-ink)]"
                  >
                    <Pencil size={13} />
                  </button>
                </div>
              </div>

              <p className="mt-3 truncate rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] px-2.5 py-2 font-mono text-[11.5px] text-[var(--color-ink-2)] select-all">
                {urls[form.id]}
              </p>

              {form.submissions > 0 && (
                <Link
                  href={`/onboarding/${form.id}`}
                  className="mt-3 inline-block text-[12.5px] font-medium underline underline-offset-4"
                >
                  Read the {form.submissions} {form.submissions === 1 ? "reply" : "replies"}
                </Link>
              )}
            </Card>
          ))}
        </div>
      )}

      <FormEditor
        open={open}
        onClose={() => setOpen(false)}
        form={editing}
        clients={clients}
        starterFields={starterFields}
      />
    </>
  );
}
