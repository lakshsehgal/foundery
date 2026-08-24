import "server-only";
import type { Role } from "./auth";
import { getSetting, setSetting } from "./db";
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
  /** Amounts on invoices. Dates, terms and status are always visible. */
  invoiceAmounts: boolean;
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
  {
    key: "operator_sees_invoice_amounts",
    label: "Invoice amounts",
    hint: "The figure on each invoice. With this off the operator still chases dates, terms and paid/unpaid.",
    fallback: "1",
  },
] as const;

function flag(key: string, fallback: string): boolean {
  return getSetting(key, fallback) === "1";
}

export function policyFor(role: Role): Visibility {
  if (role === "founder") {
    return {
      role,
      clientValues: true,
      invoiceAmounts: true,
      founderAnalytics: true,
      pnl: true,
      costLineItems: () => true,
    };
  }
  return {
    role,
    clientValues: flag("operator_sees_client_values", "0"),
    invoiceAmounts: flag("operator_sees_invoice_amounts", "1"),
    founderAnalytics: false,
    pnl: false,
    // Salary line items are never operator-visible, by design and not by setting.
    costLineItems: (category) => !SENSITIVE_CATEGORIES.includes(category),
  };
}

export function readOperatorSwitches(): { key: string; value: boolean }[] {
  return OPERATOR_SWITCHES.map((s) => ({ key: s.key, value: flag(s.key, s.fallback) }));
}

export function writeOperatorSwitch(key: string, value: boolean) {
  if (!OPERATOR_SWITCHES.some((s) => s.key === key)) {
    throw new Error(`Unknown visibility switch: ${key}`);
  }
  setSetting(key, value ? "1" : "0");
}
