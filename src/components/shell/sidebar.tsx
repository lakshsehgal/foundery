"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useSyncExternalStore } from "react";
import {
  BadgeIndianRupee, ChevronsLeft, ChevronsRight, FileText, LayoutGrid, LineChart,
  Lock, LogOut, Moon, Receipt, Settings, Sun, Users, Wallet,
} from "lucide-react";
import type { Role } from "@/lib/auth";
import { Logo } from "@/components/ui/primitives";
import { signOut } from "@/app/actions/auth";

type Item = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  founderOnly?: boolean;
};

const ITEMS: Item[] = [
  { href: "/", label: "Today", icon: LayoutGrid },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/costs", label: "Costs", icon: Wallet },
  { href: "/invoices", label: "Invoices", icon: Receipt },
  { href: "/onboarding", label: "Onboarding", icon: FileText },
  { href: "/founder", label: "Founder dashboard", icon: LineChart, founderOnly: true },
  { href: "/pnl", label: "Profit & P&L", icon: BadgeIndianRupee, founderOnly: true },
  { href: "/settings", label: "Settings", icon: Settings, founderOnly: true },
];

/**
 * Theme and rail width live in the browser — on `<html data-theme>` and in
 * localStorage — not in React. Reading them with useSyncExternalStore means
 * the server renders the documented default and the client corrects itself in
 * the same commit, instead of rendering once and then setting state in an
 * effect to render again.
 */
const PREFS_EVENT = "foundery:prefs";

function subscribePrefs(onChange: () => void) {
  window.addEventListener(PREFS_EVENT, onChange);
  // Another tab changing the preference should move this one too.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(PREFS_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readPref(key: string, value: string): boolean {
  try {
    return localStorage.getItem(key) === value;
  } catch {
    // Storage can throw outright in a locked-down browser. Fall back to the
    // default rather than taking the sidebar down with it.
    return false;
  }
}

function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Nothing to do — the change still applies for this page view.
  }
  window.dispatchEvent(new Event(PREFS_EVENT));
}

export function Sidebar({ role, email }: { role: Role; email: string | null }) {
  const pathname = usePathname();

  const collapsed = useSyncExternalStore(
    subscribePrefs,
    () => readPref("foundery-rail", "1"),
    () => false, // the server can't know; expanded is the documented default
  );

  const theme = useSyncExternalStore(
    subscribePrefs,
    () => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"),
    () => "light" as const,
  );

  const toggleTheme = useCallback(() => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    writePref("foundery-theme", next);
  }, []);

  const toggleRail = useCallback(() => {
    writePref("foundery-rail", readPref("foundery-rail", "1") ? "0" : "1");
  }, []);

  const visible = ITEMS.filter((item) => !item.founderOnly || role === "founder");

  // Below `lg` the rail is always narrow: 224px of a 390px screen is most of
  // the phone. The manual toggle only has anything to do on a wide screen, so
  // the responsive half is CSS and nothing waits on JS to be right.
  const rail = collapsed ? "w-[60px]" : "w-[60px] lg:w-[224px]";
  const label = collapsed ? "hidden" : "hidden lg:inline";
  const block = collapsed ? "hidden" : "hidden lg:flex";
  const itemLayout = collapsed
    ? "justify-center px-0"
    : "justify-center px-0 lg:justify-start lg:px-2.5";

  return (
    <nav
      className={`flex shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-surface)] transition-[width] duration-200 ${rail}`}
    >
      <div className="flex h-14 shrink-0 items-center border-b border-[var(--color-line)] px-3">
        <span
          aria-hidden
          title="Neuroid Cortex"
          className={`mx-auto h-6 w-6 rounded-[var(--radius-xs)] ${collapsed ? "" : "lg:hidden"}`}
          style={{ background: "var(--color-brand)" }}
        />
        <span className={`${block} items-center gap-2.5`}>
          <Logo size={26} />
          <span className="mt-[3px] text-[11px] font-semibold uppercase leading-none tracking-[0.2em] text-[var(--color-ink-3)]">
            Cortex
          </span>
        </span>
      </div>

      <ul className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-3">
        {visible.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                title={collapsed ? item.label : undefined}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-[var(--radius-md)] py-2 text-[13px] transition-colors ${
                  active
                    ? "bg-[var(--color-brand)] font-semibold text-[var(--color-brand-ink)]"
                    : "text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
                } ${itemLayout}`}
              >
                <Icon size={16} />
                <span className={`min-w-0 truncate ${label}`}>{item.label}</span>
                {item.founderOnly && (
                  <Lock
                    size={11}
                    aria-label="Founder only"
                    className={`ml-auto shrink-0 opacity-45 ${label}`}
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto border-t border-[var(--color-line)] p-2.5">
        {/* Profile: who this session belongs to, and as what. */}
        <div
          title={email ?? "Signed in with a passcode"}
          className={`mb-2 ${block} items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-surface-2)] px-2.5 py-2`}
        >
          <span
            aria-hidden
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold"
            style={
              role === "founder"
                ? { background: "var(--color-brand)", color: "var(--color-brand-ink)" }
                : { background: "var(--color-surface-3)", color: "var(--color-ink-2)" }
            }
          >
            {(email ?? role).charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[12px] font-medium">{email ?? "Passcode session"}</p>
            <p className="truncate text-[10.5px] capitalize text-[var(--color-ink-3)]">
              {role} · {role === "founder" ? "sees everything" : "day-to-day view"}
            </p>
          </div>
        </div>

        <div
          className={`flex items-center gap-1 ${
            collapsed ? "flex-col" : "flex-col lg:flex-row"
          }`}
        >
          <button
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light" : "Switch to dark"}
            title={theme === "dark" ? "Switch to light" : "Switch to dark"}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
          >
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button
            onClick={toggleRail}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand" : "Collapse"}
            className="hidden h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)] lg:grid"
          >
            {collapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
          </button>
          <form action={signOut} className={collapsed ? "" : "lg:ml-auto"}>
            <button
              type="submit"
              aria-label="Sign out"
              title="Sign out"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
            >
              <LogOut size={14} />
            </button>
          </form>
        </div>
      </div>
    </nav>
  );
}
