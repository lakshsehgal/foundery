import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { clientOptions, listForms, publicFormUrl } from "@/lib/queries";
import { defaultFields } from "@/lib/taxonomy";
import { PageBody, PageHeader } from "@/components/ui/primitives";
import { OnboardingView } from "./onboarding-view";

export const metadata: Metadata = { title: "Onboarding" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  await requireRole();

  const forms = listForms();
  const urls = Object.fromEntries(forms.map((form) => [form.id, publicFormUrl(form.token)]));
  const replies = forms.reduce((sum, form) => sum + form.submissions, 0);

  return (
    <>
      <PageHeader
        title="Onboarding"
        subtitle={`${forms.length} form${forms.length === 1 ? "" : "s"} · ${replies} ${
          replies === 1 ? "reply" : "replies"
        }`}
      />
      <PageBody>
        <OnboardingView
          forms={forms}
          urls={urls}
          clients={clientOptions().map((client) => ({ id: client.id, name: client.name }))}
          starterFields={defaultFields()}
        />
      </PageBody>
    </>
  );
}
