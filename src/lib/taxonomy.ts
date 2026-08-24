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
