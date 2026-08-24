/**
 * Single source of truth for the vocabulary of the business.
 *
 * Rule 3 of the UI kit: series colours are assigned by fixed slot, never
 * cycled — so a cost category keeps the same colour on the costs table, the
 * P&L and the founder dashboard. Change a colour here and it changes
 * everywhere at once.
 */

export type CostCategory =
  | "salary"
  | "tools"
  | "contractor"
  | "charity"
  | "marketing"
  | "other";

export const COST_CATEGORIES: {
  key: CostCategory;
  label: string;
  tone: string;
  /** Person-level detail is hidden from the operator for these. */
  sensitive: boolean;
  hint: string;
}[] = [
  {
    key: "salary",
    label: "Salaries",
    tone: "var(--color-series-1)",
    sensitive: true,
    hint: "In-house team. The operator sees the category total, never a person's pay.",
  },
  {
    key: "tools",
    label: "Tools",
    tone: "var(--color-series-2)",
    sensitive: false,
    hint: "Software the team runs on. Annual plans are shown at their monthly equivalent.",
  },
  {
    key: "contractor",
    label: "Contractors",
    tone: "var(--color-series-3)",
    sensitive: false,
    hint: "Freelance and per-project delivery spend.",
  },
  {
    key: "marketing",
    label: "Marketing",
    tone: "var(--color-series-4)",
    sensitive: false,
    hint: "What we spend to win work — ads, content, sponsorships.",
  },
  {
    key: "charity",
    label: "Charity",
    tone: "var(--color-series-5)",
    sensitive: false,
    hint: "Giving and community commitments.",
  },
  {
    key: "other",
    label: "Other",
    tone: "var(--color-series-6)",
    sensitive: false,
    hint: "Rent, compliance, travel — anything that fits nowhere else.",
  },
];

export const CATEGORY_TONE: Record<CostCategory, string> = Object.fromEntries(
  COST_CATEGORIES.map((c) => [c.key, c.tone]),
) as Record<CostCategory, string>;

export const CATEGORY_LABEL: Record<CostCategory, string> = Object.fromEntries(
  COST_CATEGORIES.map((c) => [c.key, c.label]),
) as Record<CostCategory, string>;

/** The categories whose line items an operator must never see. */
export const SENSITIVE_CATEGORIES: CostCategory[] = COST_CATEGORIES.filter(
  (c) => c.sensitive,
).map((c) => c.key);

export function isCostCategory(value: string): value is CostCategory {
  return COST_CATEGORIES.some((c) => c.key === value);
}

export const CADENCES = [
  { key: "monthly", label: "Every month" },
  { key: "annual", label: "Once a year" },
  { key: "one_time", label: "One off" },
] as const;

/* ------------------------------------------------------------------ clients */

export const SERVICES = [
  "Performance marketing",
  "Performance creatives",
  "UGC",
  "Social media",
  "AI ads",
  "Email & retention",
  "Web & landing pages",
  "Strategy & consulting",
] as const;

export type ClientStatus = "active" | "paused" | "churned";
export type Engagement = "retainer" | "one_time";

export const CLIENT_STATUS: Record<ClientStatus, { label: string; tone: string }> = {
  active: { label: "Active", tone: "var(--color-good)" },
  paused: { label: "Paused", tone: "var(--color-warning)" },
  churned: { label: "Churned", tone: "var(--color-ink-3)" },
};

export const ENGAGEMENT: Record<Engagement, { label: string; short: string }> = {
  retainer: { label: "Retainer", short: "Monthly retainer" },
  one_time: { label: "One-off project", short: "One-off project" },
};

export type Health = "green" | "amber" | "red";

export const HEALTH: Record<Health, { label: string; tone: string; hint: string }> = {
  green: { label: "Healthy", tone: "var(--color-good)", hint: "Delivering, paying, no noise." },
  amber: { label: "Watch", tone: "var(--color-warning)", hint: "Something needs a conversation." },
  red: { label: "At risk", tone: "var(--color-critical)", hint: "Could leave this quarter." },
};

/* ----------------------------------------------------------------- invoices */

export type InvoiceStatus = "draft" | "sent" | "part_paid" | "paid" | "void";

export const INVOICE_STATUS: Record<InvoiceStatus, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "var(--color-ink-3)" },
  sent: { label: "Sent", tone: "var(--color-series-1)" },
  part_paid: { label: "Part paid", tone: "var(--color-warning)" },
  paid: { label: "Paid", tone: "var(--color-good)" },
  void: { label: "Void", tone: "var(--color-ink-3)" },
};

/** Default onboarding questions a new form starts with. */
export const DEFAULT_ONBOARDING_FIELDS = [
  { key: "brand", label: "Brand name", type: "text", required: true, hint: "" },
  { key: "contact_name", label: "Main point of contact", type: "text", required: true, hint: "Who we speak to day to day." },
  { key: "contact_email", label: "Email", type: "email", required: true, hint: "" },
  { key: "whatsapp", label: "WhatsApp number", type: "text", required: false, hint: "For the shared delivery group." },
  { key: "website", label: "Website", type: "url", required: true, hint: "" },
  { key: "category", label: "What do you sell?", type: "text", required: true, hint: "" },
  { key: "monthly_spend", label: "Current monthly ad spend", type: "text", required: false, hint: "Roughly is fine." },
  { key: "goal", label: "What does a great first 90 days look like?", type: "textarea", required: true, hint: "" },
  { key: "audience", label: "Who is the customer?", type: "textarea", required: false, hint: "" },
  { key: "assets", label: "Link to brand assets", type: "url", required: false, hint: "Drive or Dropbox folder with logos, product shots, past creatives." },
  { key: "access", label: "Who gives us ad account and store access?", type: "text", required: false, hint: "Name and email of whoever holds the logins." },
  { key: "anything_else", label: "Anything else we should know?", type: "textarea", required: false, hint: "" },
] as const;

export function defaultFields(): OnboardingField[] {
  return DEFAULT_ONBOARDING_FIELDS.map((field) => ({
    ...field,
    hint: field.hint || undefined,
  }));
}

export const FIELD_TYPES = ["text", "email", "url", "textarea", "number"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export type OnboardingField = {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  hint?: string;
};

/* ------------------------------------------------------- guided onboarding */

/**
 * Step 1 of the guided flow: the details every new client gives us before
 * anything else moves. Fixed on purpose — this is the contract-and-billing
 * information, not a form the team improvises per client.
 */
export const ONBOARDING_DETAIL_FIELDS = [
  { key: "contact_name", label: "Full name", type: "text", required: true, hint: "Who we speak to day to day." },
  { key: "email", label: "Email", type: "email", required: true, hint: "" },
  { key: "phone", label: "Phone number", type: "text", required: true, hint: "WhatsApp-reachable, ideally." },
  { key: "authorized_signatory", label: "Authorised signatory", type: "text", required: true, hint: "Who signs the agreement on your side." },
  { key: "gst_certificate", label: "GST certificate", type: "url", required: true, hint: "Upload it to Drive or Dropbox and paste the link here." },
  { key: "shopify_domain", label: "Shopify domain", type: "text", required: true, hint: "e.g. yourbrand.myshopify.com" },
  { key: "google_ads_id", label: "Google Ads account ID", type: "text", required: false, hint: "The 10-digit ID, like 123-456-7890. Skip if you don't run Google yet." },
] as const satisfies readonly OnboardingField[];

/**
 * Step 2: the accesses we need before delivery can start. Each item carries
 * the instruction the client sees; `settingKey` names a settings row that,
 * when filled in on /settings, gets appended to the instruction (our BM id,
 * collaborator code, and so on).
 */
export type AccessItem = {
  key: string;
  label: string;
  hint: string;
  settingKey?: string;
  settingLabel?: string;
};

export const ACCESS_ITEMS: AccessItem[] = [
  {
    key: "meta_bm",
    label: "Meta Business Manager — partner access",
    hint: "Business settings → Partners → Add → Give a partner access to your assets.",
    settingKey: "neuroid_meta_bm_id",
    settingLabel: "Our Business Manager ID",
  },
  {
    key: "meta_ad_account",
    label: "Meta ad account",
    hint: "Share the ad account to our Business Manager with Manage access.",
  },
  {
    key: "shopify",
    label: "Shopify — collaborator access",
    hint: "Settings → Users and permissions → Collaborators.",
    settingKey: "neuroid_shopify_collab",
    settingLabel: "Our collaborator request code",
  },
  {
    key: "google_ads",
    label: "Google Ads account",
    hint: "We'll send a link request from our manager account — accept it under Access and security.",
    settingKey: "neuroid_google_mcc",
    settingLabel: "Our manager (MCC) ID",
  },
  {
    key: "gmc",
    label: "Google Merchant Center",
    hint: "Settings → People and access → add us with Standard access.",
    settingKey: "neuroid_gmc_email",
    settingLabel: "The email to invite",
  },
  {
    key: "ga4",
    label: "Google Analytics (GA4)",
    hint: "Admin → Property access management → add us as Analyst or above.",
    settingKey: "neuroid_ga_email",
    settingLabel: "The email to invite",
  },
];

export type OnboardingStatus = "invited" | "details_done" | "completed";

export const ONBOARDING_STATUS: Record<OnboardingStatus, { label: string; tone: string }> = {
  invited: { label: "Link sent", tone: "var(--color-series-1)" },
  details_done: { label: "Details in — accesses pending", tone: "var(--color-warning)" },
  completed: { label: "Onboarded", tone: "var(--color-good)" },
};
