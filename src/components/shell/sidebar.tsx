"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    if (document.documentElement.getAttribute("data-theme") === "dark") setTheme("dark");
    setCollapsed(localStorage.getItem("foundery-rail") === "1");
  }, []);

  function toggleTheme() {
    setTheme((value) => {
      const next = value === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("foundery-theme", next);
      return next;
    });
  }

  function toggleRail() {
    setCollapsed((value) => {
      localStorage.setItem("foundery-rail", value ? "0" : "1");
      return !value;
    });
  }

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
          title="Foundery"
          className={`mx-auto h-6 w-6 rounded-[var(--radius-xs)] ${collapsed ? "" : "lg:hidden"}`}
          style={{ background: "var(--color-brand)" }}
        />
        <span className={block}>
          <Logo size={22} />
        </span>
      </div>

      <ul className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-3">
        {visible.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href} className="relative">
              {active && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full"
                  style={{ background: "var(--color-brand)" }}
                />
              )}
              <Link
                href={item.href}
                title={collapsed ? item.label : undefined}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-[var(--radius-md)] py-2 text-[13px] transition-colors ${
                  active
                    ? "bg-[var(--color-surface-3)] font-semibold text-[var(--color-ink)]"
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
        <div
          className={`mb-2 ${block} items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-surface-2)] px-2.5 py-2`}
        >
          <span
            aria-hidden
            className="h-6 w-6 shrink-0 rounded-full"
            style={{ background: role === "founder" ? "var(--color-brand)" : "var(--color-surface-3)" }}
          />
          <div className="min-w-0">
            <p className="truncate text-[12px] font-medium capitalize">{role}</p>
            <p className="truncate text-[10.5px] text-[var(--color-ink-3)]">
              {role === "founder" ? "Sees everything" : "Day-to-day view"}
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
