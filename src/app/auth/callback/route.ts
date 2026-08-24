import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { grantSession } from "@/app/actions/auth";
import { roleForEmail, supabaseAnonKey, supabaseUrl } from "@/lib/identity";
import { logAudit } from "@/lib/db";

/**
 * Google sends the user back here. The code becomes a Supabase session just
 * long enough to learn which verified email this is; then Foundery's own
 * role cookie is minted from the allowlist and the Supabase session is
 * dropped — one session system, not two.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/login?error=missing-code", request.url));

  const jar = await cookies();
  const supabase = createServerClient(supabaseUrl()!, supabaseAnonKey()!, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (toSet) => toSet.forEach(({ name, value, options }) => jar.set(name, value, options)),
    },
  });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  const email = data?.user?.email;
  if (error || !email) {
    return NextResponse.redirect(new URL("/login?error=google-failed", request.url));
  }

  const role = roleForEmail(email);
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});

  if (!role) {
    await logAudit("public", "sign_in_denied", "email", undefined, email);
    return NextResponse.redirect(new URL("/login?error=not-on-team", request.url));
  }

  await grantSession(role);
  await logAudit(role, "sign_in", "method", undefined, "google");
  return NextResponse.redirect(new URL("/", request.url));
}
