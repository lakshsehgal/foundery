import "server-only";
import type { Role } from "./session";
import { getSettings, setSetting } from "./db";
import type { CostCategory } from "./taxonomy";
import { SENSITIVE_CATEGORIES } from "./taxonomy";

/**
 * Who is allowed to see what.
 *
 * Every redaction in the app resolves through this one object, so the answer
 * to "can the operator see X" is readable in a single file rather than
 * scattered across pages. The founder always sees everything; the operator's
 * view is governed by switches the founder controls on /settings.
 *
 * The rule that is NOT a switch: an individual person's pay. That is hard
 * off for the operator, whatever the settings say.
 */
export type Visibility = {
  role: Role;
  /** Per-client money: retainer value, project value, cost to serve, health. */
  clientValues: boolean;
  /** Margins, revenue projections, risk analysis. */
  founderAnalytics: boolean;
  /** Profit tracker and P&L. */
  pnl: boolean;
  /** Line-item detail for a cost category. Category totals are always shown. */
  costLineItems: (category: CostCategory) => boolean;
};

export const OPERATOR_SWITCHES = [
  {
    key: "operator_sees_client_values",
    label: "Client values",
    hint: "Retainer size, project value and cost to serve on the clients table.",
    fallback: "0",
  },
] as const;

const FOUNDER_SEES_EVERYTHING: Omit<Visibility, "role"> = {
  clientValues: true,
  founderAnalytics: true,
  pnl: true,
  costLineItems: () => true,
};

export async function policyFor(role: Role): Promise<Visibility> {
  if (role === "founder") return { role, ...FOUNDER_SEES_EVERYTHING };

  const settings = await getSettings();
  const flag = (key: string, fallback: string) => (settings.get(key) ?? fallback) === "1";

  return {
    role,
    clientValues: flag("operator_sees_client_values", "0"),
    founderAnalytics: false,
    pnl: false,
    // Salary line items are never operator-visible, by design and not by setting.
    costLineItems: (category) => !SENSITIVE_CATEGORIES.includes(category),
  };
}

export async function readOperatorSwitches(): Promise<{ key: string; value: boolean }[]> {
  const settings = await getSettings();
  return OPERATOR_SWITCHES.map((definition) => ({
    key: definition.key,
    value: (settings.get(definition.key) ?? definition.fallback) === "1",
  }));
}

export async function writeOperatorSwitch(key: string, value: boolean) {
  if (!OPERATOR_SWITCHES.some((definition) => definition.key === key)) {
    throw new Error(`Unknown visibility switch: ${key}`);
  }
  await setSetting(key, value ? "1" : "0");
}
