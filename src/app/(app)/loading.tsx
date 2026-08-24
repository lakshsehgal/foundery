/**
 * Rule 17: skeletons, not spinners. This renders the instant a navigation
 * starts, at roughly the height of what's coming, so a click always answers
 * within a frame — the data streams in behind it.
 */
export default function AppLoading() {
  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-[var(--color-line)] bg-[var(--color-surface)] px-5">
        <div className="skeleton h-4 w-32" />
        <div className="ml-auto flex items-center gap-2">
          <div className="skeleton h-8 w-24" />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mx-auto max-w-[1120px] space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((tile) => (
              <div
                key={tile}
                className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4"
              >
                <div className="skeleton h-3 w-24" />
                <div className="skeleton mt-3 h-7 w-16" />
                <div className="skeleton mt-3 h-3 w-28" />
              </div>
            ))}
          </div>

          <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
            <div className="skeleton h-4 w-40" />
            <div className="mt-4 space-y-3">
              {[0, 1, 2, 3, 4].map((row) => (
                <div key={row} className="flex items-center gap-3">
                  <div className="skeleton h-6 w-6 rounded-full" />
                  <div className="skeleton h-3.5 flex-1" />
                  <div className="skeleton h-3.5 w-20" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
