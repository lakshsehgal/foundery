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
 * Guided onboarding comes in two flavours: the full performance-marketing
 * flow (platform accesses, pixels, analytics) and the lighter creative flow
 * (brand assets and a view-only ad account). Each flow carries its own
 * details form and its own accesses step.
 */
export type OnboardingFlow = "performance" | "creative";

export const ONBOARDING_FLOWS: Record<
  OnboardingFlow,
  { label: string; short: string; hint: string }
> = {
  performance: {
    label: "Performance marketing",
    short: "Performance",
    hint: "The full platform checklist — ad accounts, pixels, analytics.",
  },
  creative: {
    label: "Creative",
    short: "Creative",
    hint: "Brand assets plus a view-only ad account for creative analytics.",
  },
};

/**
 * Step 1 of the guided flow: the details every new client gives us before
 * anything else moves. Fixed on purpose — this is the contract-and-billing
 * information, not a form the team improvises per client.
 */
export const ONBOARDING_DETAIL_FIELDS = [
  { key: "authorized_signatory", label: "Authorised signatory name", type: "text", required: true, hint: "Who signs the agreement on your side." },
  { key: "signatory_position", label: "Authorised signatory position", type: "text", required: true, hint: "Founder, director, marketing head…" },
  { key: "email", label: "Email", type: "email", required: true, hint: "" },
  { key: "phone", label: "Phone number", type: "text", required: true, hint: "WhatsApp-reachable, ideally." },
  { key: "gstin", label: "GSTIN", type: "text", required: true, hint: "The 15-character GST number." },
  { key: "shopify_domain", label: "Shopify domain", type: "text", required: true, hint: "e.g. yourbrand.myshopify.com" },
  { key: "shopify_collab_code", label: "Shopify collaborator code", type: "text", required: true, hint: "Shopify admin → Settings → Users and permissions → Collaborators." },
  { key: "google_ads_id", label: "Google Ads account ID", type: "text", required: false, hint: "The 10-digit ID, like 123-456-7890. Only if Google Ads is in your scope." },
] as const satisfies readonly OnboardingField[];

/** The creative flow asks for the contract-and-billing identity, nothing else. */
export const CREATIVE_DETAIL_FIELDS = [
  { key: "authorized_signatory", label: "Authorised signatory name", type: "text", required: true, hint: "Who signs the agreement on your side." },
  { key: "signatory_position", label: "Authorised person's position", type: "text", required: true, hint: "Founder, director, marketing head…" },
  { key: "email", label: "Email", type: "email", required: true, hint: "" },
  { key: "phone", label: "Phone number", type: "text", required: true, hint: "WhatsApp-reachable, ideally." },
  { key: "legal_company_name", label: "Legal company name", type: "text", required: true, hint: "Exactly as it reads on your GST certificate." },
  { key: "gstin", label: "GSTIN", type: "text", required: true, hint: "The 15-character GST number." },
] as const satisfies readonly OnboardingField[];

export function detailFieldsFor(flow: OnboardingFlow): readonly OnboardingField[] {
  return flow === "creative" ? CREATIVE_DETAIL_FIELDS : ONBOARDING_DETAIL_FIELDS;
}

/**
 * Step 2: the accesses we need before delivery can start, grouped by
 * platform. Each group can carry one configurable value — our BM ID, the
 * Google admin email — read from settings with Neuroid's own as the default;
 * "{value}" in a hint or banner is replaced with it server-side.
 */
export type AccessItem = {
  key: string;
  label: string;
  hint: string;
  /**
   * Without it the item is a checkbox the client ticks. With it the item is
   * something they hand over — a link or a piece of text — and counts as done
   * once filled in.
   */
  input?: "url" | "text";
};

export type AccessGroup = {
  key: string;
  label: string;
  /** Settings row that personalises this group; the default is Neuroid's own. */
  settingKey?: string;
  settingDefault?: string;
  /** A copyable ID card shown before the items — the value is the group's. */
  highlight?: { title: string; text: string };
  /** A tinted note above the items. */
  banner?: { text: string; tone: "info" | "good" };
  items: AccessItem[];
};

export const ACCESS_GROUPS: AccessGroup[] = [
  {
    key: "meta",
    label: "Meta (Facebook & Instagram)",
    settingKey: "neuroid_meta_bm_id",
    settingDefault: "1100898224148253",
    highlight: {
      title: "Our Business Manager ID",
      text: "Please share access to your ad account, Facebook page, Instagram page, catalogues & pixel to our BM:",
    },
    items: [
      {
        key: "meta_ad_account",
        label: "Ad Account Access",
        hint: "Share your ad account access to our BM ID: {value}",
      },
      {
        key: "meta_pages",
        label: "Facebook & Instagram Page Access",
        hint: "Share your Facebook Page and Instagram Page access to our BM ID: {value}",
      },
      {
        key: "meta_catalogue",
        label: "Catalogue Access",
        hint: "Share your product catalogue access to our BM ID: {value}",
      },
      {
        key: "meta_pixel",
        label: "Pixel Access",
        hint: "Share your Meta Pixel access to our BM ID: {value}",
      },
    ],
  },
  {
    key: "google",
    label: "Google",
    settingKey: "neuroid_google_admin",
    settingDefault: "admin@neuroidmedia.com",
    banner: { text: "For GA4, GTM & GMC: Please add {value} as an Admin user.", tone: "info" },
    items: [
      {
        key: "google_ads",
        label: "Google Ads — Accept Partner Request",
        hint: "We'll send a partner link request to your Google Ads account. Please accept it when you receive it.",
      },
      {
        key: "ga4",
        label: "Google Analytics (GA4) Access",
        hint: "Add {value} as an Admin user in your GA4 property",
      },
      {
        key: "gtm",
        label: "Google Tag Manager (GTM) Access",
        hint: "Add {value} as a user with Admin access in GTM",
      },
    ],
  },
  {
    key: "shopify",
    label: "Shopify",
    banner: {
      text: "Thank you for sharing your collaborator code! Our onboarding manager will send a collaborator request to your Shopify store. Just accept it when it arrives.",
      tone: "good",
    },
    items: [
      {
        key: "shopify",
        label: "Shopify — Accept Collaborator Request",
        hint: "Our onboarding manager will send a collaborator request to access your Shopify store backend. Please accept it when you receive it.",
      },
    ],
  },
  {
    key: "other",
    label: "Other Platforms",
    settingKey: "neuroid_google_admin",
    settingDefault: "admin@neuroidmedia.com",
    items: [
      {
        key: "gmc",
        label: "Google Merchant Centre (GMC) Access",
        hint: "Add {value} as an Admin user in your Google Merchant Centre",
      },
    ],
  },
];

/** The creative flow: one view-only Meta access, then the brand handover. */
export const CREATIVE_ACCESS_GROUPS: AccessGroup[] = [
  {
    key: "meta",
    label: "Meta (Facebook & Instagram)",
    settingKey: "neuroid_meta_bm_id",
    settingDefault: "1100898224148253",
    highlight: {
      title: "Our Business Manager ID",
      text: "Please share view-only access to your ad account to our BM — we use it for creative analytics:",
    },
    items: [
      {
        key: "meta_ad_account_view",
        label: "Meta Ad Account Access (view only)",
        hint: "Share view-only access to your ad account to our BM ID: {value} — enough for creative analytics, nothing more.",
      },
    ],
  },
  {
    key: "brand",
    label: "Brand & Assets",
    items: [
      {
        key: "brand_guide",
        label: "Link to brand guide",
        hint: "A Drive, Dropbox or Notion link to your brand guidelines.",
        input: "url",
      },
      {
        key: "asset_files",
        label: "Link to asset files",
        hint: "Logos, font files, product shots — one folder link is perfect.",
        input: "url",
      },
      {
        key: "avoid_list",
        label: "Anything to avoid",
        hint: "Words, phrases or elements we should never use in your ads.",
        input: "text",
      },
    ],
  },
];

export function accessGroupsFor(flow: OnboardingFlow): AccessGroup[] {
  return flow === "creative" ? CREATIVE_ACCESS_GROUPS : ACCESS_GROUPS;
}

/** The flat checklist — saving, completion and the internal views read this. */
export function accessItemsFor(flow: OnboardingFlow): AccessItem[] {
  return accessGroupsFor(flow).flatMap((group) => group.items);
}

/** Free-text extras live in the same jsonb under a key no checkbox can claim. */
export const ACCESS_NOTES_KEY = "_notes";

export type OnboardingStatus = "invited" | "details_done" | "completed";

export const ONBOARDING_STATUS: Record<OnboardingStatus, { label: string; tone: string }> = {
  invited: { label: "Link sent", tone: "var(--color-series-1)" },
  details_done: { label: "Details in — accesses pending", tone: "var(--color-warning)" },
  completed: { label: "Onboarded", tone: "var(--color-good)" },
};
