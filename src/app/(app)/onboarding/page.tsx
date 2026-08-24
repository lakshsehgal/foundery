import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import {
  clientOptions, listForms, listGuidedOnboardings, publicFormUrl, publicWelcomeUrl,
} from "@/lib/queries";
import { defaultFields } from "@/lib/taxonomy";
import { PageBody, PageHeader } from "@/components/ui/primitives";
import { OnboardingView } from "./onboarding-view";
import { GuidedList } from "./guided-list";
import { CardTitle } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Onboarding" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  await requireRole();

  const [forms, clients, guided] = await Promise.all([
    listForms(),
    clientOptions(),
    listGuidedOnboardings(),
  ]);
  const urls = Object.fromEntries(forms.map((form) => [form.id, publicFormUrl(form.token)]));
  const guidedUrls = Object.fromEntries(
    guided.map((record) => [record.id, publicWelcomeUrl(record.token)]),
  );
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
        {guided.length > 0 && (
          <section>
            <CardTitle
              title="Client onboardings"
              hint="Started from a client's card. Each link is personal — the client sees their name, a details form, then the access checklist."
            />
            <GuidedList onboardings={guided} urls={guidedUrls} />
          </section>
        )}

        <OnboardingView
          forms={forms}
          urls={urls}
          clients={clients.map((client) => ({ id: client.id, name: client.name }))}
          starterFields={defaultFields()}
        />
      </PageBody>
    </>
  );
}
