import "server-only";

/**
 * Zoho Books, read-only.
 *
 * Auth is the OAuth "self client" flow: a one-time refresh token in the
 * environment, exchanged here for short-lived access tokens (cached until
 * a minute before expiry). Setup lives in README → "Zoho Books sync".
 *
 * Sync direction is one-way, Zoho → Foundery, on purpose: Zoho stays the
 * accounting system of record; Foundery mirrors the state to drive the
 * chasing feed and the P&L. Nothing here writes back to Zoho.
 */

const DC = () => process.env.ZOHO_DC || "in"; // Indian data centre by default

export function zohoConfigured(): boolean {
  return Boolean(
    process.env.ZOHO_CLIENT_ID &&
      process.env.ZOHO_CLIENT_SECRET &&
      process.env.ZOHO_REFRESH_TOKEN &&
      process.env.ZOHO_ORG_ID,
  );
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: process.env.ZOHO_CLIENT_ID!,
    client_secret: process.env.ZOHO_CLIENT_SECRET!,
    refresh_token: process.env.ZOHO_REFRESH_TOKEN!,
  });

  const response = await fetch(`https://accounts.zoho.${DC()}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await response.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!response.ok || !json.access_token) {
    throw new Error(`Zoho token refresh failed: ${json.error ?? response.status}`);
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
export async function fetchZohoInvoices(): Promise<ZohoInvoice[]> {
  const token = await accessToken();
  const out: ZohoInvoice[] = [];

  for (let page = 1; page <= 40; page++) {
    const url = new URL(`https://www.zohoapis.${DC()}/books/v3/invoices`);
    url.searchParams.set("organization_id", process.env.ZOHO_ORG_ID!);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", "200");

    const response = await fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });
    const json = (await response.json()) as {
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

/** Zoho's invoice statuses folded onto Foundery's five. */
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
