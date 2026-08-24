import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Inbox } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { listForms, listSubmissions, publicFormUrl } from "@/lib/queries";
import { prettyDate } from "@/lib/dates";
import { Card, CardTitle, EmptyState, PageBody, PageHeader, SectionLabel } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Onboarding replies" };
export const dynamic = "force-dynamic";

export default async function FormSubmissionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole();

  const { id } = await params;
  const formId = Number(id);
  const forms = await listForms();
  const form = forms.find((candidate) => candidate.id === formId);
  if (!form) notFound();

  const submissions = await listSubmissions(formId);

  return (
    <>
      <PageHeader title={form.title} subtitle={`${submissions.length} replies · ${publicFormUrl(form.token)}`}>
        <Link
          href="/onboarding"
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-[12.5px] font-medium transition-colors hover:bg-[var(--color-surface-2)]"
        >
          <ArrowLeft size={13} />
          All forms
        </Link>
      </PageHeader>

      <PageBody>
        {submissions.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Inbox size={22} />}
              title="Nobody has filled this in yet"
              hint="Send the link. Answers appear here the moment they hit send — no notification needed."
            />
          </Card>
        ) : (
          submissions.map((submission) => (
            <Card key={submission.id}>
              <CardTitle
                title={
                  submission.answers.brand ||
                  submission.answers.contact_name ||
                  submission.client_name ||
                  "Reply"
                }
                hint={`Sent ${prettyDate(submission.submitted_at.slice(0, 10))} at ${submission.submitted_at.slice(11, 16)}`}
              />

              <dl className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
                {submission.fields.map((field) => {
                  const answer = submission.answers[field.key];
                  const isLong = field.type === "textarea";
                  return (
                    <div key={field.key} className={isLong ? "sm:col-span-2" : undefined}>
                      <dt>
                        <SectionLabel>{field.label}</SectionLabel>
                      </dt>
                      <dd className="mt-1 text-[13px] leading-relaxed break-words">
                        {!answer ? (
                          <span className="text-[var(--color-ink-3)]">Left blank</span>
                        ) : field.type === "url" || field.type === "email" ? (
                          <a
                            href={field.type === "email" ? `mailto:${answer}` : answer}
                            target={field.type === "url" ? "_blank" : undefined}
                            rel="noreferrer"
                            className="underline underline-offset-4"
                          >
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
            </Card>
          ))
        )}
      </PageBody>
    </>
  );
}
