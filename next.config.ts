import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/WASM modules the bundler must leave alone. PGlite is only reached
  // when DATABASE_URL is unset, which never happens on Vercel — but listing it
  // keeps the local fallback working in a built app too.
  serverExternalPackages: ["pg", "@electric-sql/pglite"],
};

export default nextConfig;
