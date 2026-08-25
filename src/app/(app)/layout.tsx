import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth";
import { Sidebar } from "@/components/shell/sidebar";

/**
 * Rule 10: the frame is h-dvh overflow-hidden and exactly one child scrolls.
 * Each page supplies its own PageHeader plus the single scrolling pane.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session) redirect("/login");

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar role={session.role} email={session.email} />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
