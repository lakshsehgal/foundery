import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentRole } from "@/lib/auth";
import { identityConfigured } from "@/lib/identity";
import { getResendConfig } from "@/lib/resend";
import { Logo } from "@/components/ui/primitives";
import { LoginForm } from "./login-form";
import { OtpLoginForm } from "./otp-form";

export const metadata: Metadata = { title: "Sign in" };

const PROMISES: [string, string][] = [
  ["Every client on one page", "Who they are, what they bought, and who matters most — without opening three tools."],
  ["The invoice you forgot to raise", "Foundery counts the days for you and says the name out loud before the month closes."],
  ["Numbers that stay yours", "Your operator runs the day. Salaries, margins and profit stay behind your passcode."],
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; method?: string }>;
}) {
  if (await currentRole()) redirect("/");
  const { error, method } = await searchParams;

  // Google needs Supabase; email codes need Resend; the passcode form is the
  // fallback for local dev and the founder's explicit escape hatch elsewhere.
  const googleAvailable = identityConfigured();
  const emailAvailable = (await getResendConfig()) !== null;
  const passcodeAvailable = Boolean(
    process.env.FOUNDERY_FOUNDER_PASSCODE || process.env.FOUNDERY_OPERATOR_PASSCODE,
  );
  const passwordless =
    (googleAvailable || emailAvailable) && method !== "passcode";

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-[#111111] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        {/* Two blurred brand-yellow orbs — the whole "designed" feeling of this
            page, and they never load anything. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -top-32 h-[30rem] w-[30rem] rounded-full opacity-[0.18] blur-3xl"
          style={{ background: "var(--color-brand)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -left-24 h-[26rem] w-[26rem] rounded-full opacity-[0.10] blur-3xl"
          style={{ background: "var(--color-brand)" }}
        />

        <div className="relative">
          <Logo size={30} tone="dark" />
        </div>

        <div className="relative max-w-lg">
          <p
            className="text-[12px] font-medium uppercase tracking-[0.2em]"
            style={{ color: "var(--color-brand)" }}
          >
            Foundery
          </p>

          <h1 className="display mt-5 text-[2.7rem] leading-[1.08] text-white">
            You should not have to open six tabs to know how the business is doing.
          </h1>

          <p className="mt-6 text-[15px] leading-relaxed text-white/70">
            Clients, costs, invoices and profit in one place — with a line down the middle so the
            people running the work see the work, and only you see the money.
          </p>

          <ul className="mt-10 space-y-3.5">
            {PROMISES.map(([title, detail]) => (
              <li key={title} className="flex gap-3">
                <span
                  aria-hidden
                  className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: "var(--color-brand)" }}
                />
                <span>
                  <span className="block text-[14px] font-medium text-white">{title}</span>
                  <span className="block text-[13px] leading-relaxed text-white/55">{detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative max-w-md text-[12.5px] leading-relaxed text-white/40">
          Neuroid Media · internal. Everything here stays on your own machine.
        </p>
      </section>

      <section className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-[22rem]">
          <div className="mb-10 lg:hidden">
            <Logo size={28} />
          </div>
          {passwordless ? (
            <OtpLoginForm
              googleError={error}
              googleAvailable={googleAvailable}
              emailAvailable={emailAvailable}
              passcodeAvailable={passcodeAvailable}
            />
          ) : (
            <LoginForm />
          )}
        </div>
      </section>
    </main>
  );
}
