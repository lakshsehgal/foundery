import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { identityConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/identity";

/**
 * Kicks off Google sign-in. Supabase builds the Google consent URL and hands
 * back a PKCE verifier, which @supabase/ssr stores in a cookie so the
 * callback — possibly served by a different serverless instance — can finish
 * the exchange.
 */
export async function GET(request: Request) {
  if (!identityConfigured()) {
    return NextResponse.redirect(new URL("/login?error=not-configured", request.url));
  }

  const jar = await cookies();
  const supabase = createServerClient(supabaseUrl()!, supabaseAnonKey()!, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (toSet) => toSet.forEach(({ name, value, options }) => jar.set(name, value, options)),
    },
  });

  const origin = new URL(request.url).origin;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback` },
  });

  if (error || !data.url) {
    return NextResponse.redirect(new URL("/login?error=google-unavailable", request.url));
  }
  return NextResponse.redirect(data.url);
}
