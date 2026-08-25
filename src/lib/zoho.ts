import "server-only";

/**
 * Zoho Books, read-only.
 *
 * Auth is the OAuth "self client" flow: a one-time refresh token in the
 * environment, exchanged here for short-lived access tokens (cached until
 * a minute before expiry). Setup lives in README → "Zoho Books sync".
 *
 * Sync direction is one-way, Zoho → Cortex, on purpose: Zoho stays the
 * accounting system of record; Cortex mirrors the state to drive the
 * chasing feed and the P&L. Nothing here writes back to Zoho.
 */

import { getSettings, setSetting } from "./db";

const DC = () => process.env.ZOHO_DC || "in"; // Indian data centre by default

export type ZohoConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  orgId: string;
};

/**
 * Credentials come from the environment when set, else from the settings
 * table — the settings path exists so the founder can connect Zoho from the
 * Settings page without touching Vercel. The settings table is founder-only
 * territory already (schema isolation + RLS + the app's own role gate), and
 * the stored token is read-scoped: it can list invoices, nothing else.
 */
export async function getZohoConfig(): Promise<ZohoConfig | null> {
  const env = {
    clientId: process.env.ZOHO_CLIENT_ID,
    clientSecret: process.env.ZOHO_CLIENT_SECRET,
    refreshToken: process.env.ZOHO_REFRESH_TOKEN,
    orgId: process.env.ZOHO_ORG_ID,
  };
  if (env.clientId && env.clientSecret && env.refreshToken && env.orgId) {
    return env as ZohoConfig;
  }

  const settings = await getSettings();
  const stored = {
    clientId: settings.get("zoho_client_id"),
    clientSecret: settings.get("zoho_client_secret"),
    refreshToken: settings.get("zoho_refresh_token"),
    orgId: settings.get("zoho_org_id"),
  };
  if (stored.clientId && stored.clientSecret && stored.refreshToken && stored.orgId) {
    return stored as ZohoConfig;
  }
  return null;
}

/**
 * One-time: turn a Self Client grant code (valid ~10 minutes) into the
 * permanent refresh token, and store the whole configuration.
 */
export async function connectWithGrantCode(
  clientId: string,
  clientSecret: string,
  grantCode: string,
  orgId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code: grantCode,
  });
  const response = await fetch(`https://accounts.zoho.${DC()}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const json = (await parseZohoJson(response, "grant-code exchange")) as {
    refresh_token?: string;
    error?: string;
  };
  if (!json.refresh_token) {
    return {
      ok: false,
      error:
        json.error === "invalid_code"
          ? "Zoho rejected the grant code — they expire in 10 minutes, so generate a fresh one and try again."
          : `Zoho said: ${json.error ?? "no refresh token returned"}.`,
    };
  }

  await setSetting("zoho_client_id", clientId);
  await setSetting("zoho_client_secret", clientSecret);
  await setSetting("zoho_refresh_token", json.refresh_token);
  await setSetting("zoho_org_id", orgId);
  cachedToken = null;
  return { ok: true };
}

/**
 * Zoho answers malformed or unauthorised requests with an HTML error page,
 * not JSON — parse defensively so the surfaced error names the problem
 * instead of dying on "Unexpected token '<'".
 */
async function parseZohoJson(response: Response, context: string): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    // The HTML page usually names the actual problem — log it whole for the
    // server logs and put a readable slice in the surfaced error.
    console.error(`zoho ${context} returned non-JSON (HTTP ${response.status}):`, text.slice(0, 2000));
    const snippet = text
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
    throw new Error(
      `Zoho ${context} returned HTTP ${response.status}${snippet ? ` — "${snippet}"` : ""}.`,
    );
  }
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(config: ZohoConfig): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
  });

  const response = await fetch(`https://accounts.zoho.${DC()}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await parseZohoJson(response, "token refresh")) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!response.ok || !json.access_token) {
    throw new Error(
      `Zoho rejected the stored credentials (${json.error ?? response.status}). ` +
        "Usually this means the refresh token isn't a real token — reconnect on the Settings page " +
        "with a fresh grant code, and remove any ZOHO_* environment variables that hold placeholder values.",
    );
  }

  cachedToken = { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return cachedToken.value;
}

export type ZohoInvoice = {
  invoice_id: string;
  invoice_number: string;
  customer_name: string;
  date: string;       // YYYY-MM-DD
  due_date: string;   // YYYY-MM-DD
  total: number;
  balance: number;
  status: string;     // draft | sent | overdue | partially_paid | paid | void | ...
};

/** Every invoice in the organisation, paginated out. */
export async function fetchZohoInvoices(config: ZohoConfig): Promise<ZohoInvoice[]> {
  const token = await accessToken(config);
  const out: ZohoInvoice[] = [];

  for (let page = 1; page <= 40; page++) {
    const url = new URL(`https://www.zohoapis.${DC()}/books/v3/invoices`);
    url.searchParams.set("organization_id", config.orgId);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", "200");

    const response = await fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });
    const json = (await parseZohoJson(response, "invoice fetch")) as {
      invoices?: ZohoInvoice[];
      page_context?: { has_more_page?: boolean };
      message?: string;
    };
    if (!response.ok) throw new Error(`Zoho invoices fetch failed: ${json.message ?? response.status}`);

    out.push(...(json.invoices ?? []));
    if (!json.page_context?.has_more_page) break;
  }

  return out;
}

/** Zoho's invoice statuses folded onto Cortex's five. */
export function mapZohoStatus(status: string, balance: number, total: number): string {
  switch (status) {
    case "draft": return "draft";
    case "void": return "void";
    case "paid": return "paid";
    case "partially_paid": return "part_paid";
    default:
      // sent, overdue, viewed, unpaid …: part-paid if money has moved.
      return balance < total ? "part_paid" : "sent";
  }
}

export type ZohoCustomer = {
  name: string;
  invoiceCount: number;
  outstanding: number;
};

/**
 * The customer book, derived from the invoices themselves — the token is
 * scoped to invoices only, and every invoice carries its customer's name, so
 * no extra scope is needed to know who the customers are.
 */
export function customersFromInvoices(invoices: ZohoInvoice[]): ZohoCustomer[] {
  const map = new Map<string, ZohoCustomer>();
  for (const invoice of invoices) {
    const key = invoice.customer_name.trim();
    const entry = map.get(key) ?? { name: key, invoiceCount: 0, outstanding: 0 };
    entry.invoiceCount += 1;
    entry.outstanding += invoice.balance;
    map.set(key, entry);
  }
  return [...map.values()].sort(
    (a, b) => b.outstanding - a.outstanding || a.name.localeCompare(b.name),
  );
}
