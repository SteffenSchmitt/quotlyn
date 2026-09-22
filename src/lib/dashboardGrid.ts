/** How many cards the dashboard puts in a row on a wide window. */
export type DashboardColumns = 2 | 3 | 4
export const DASHBOARD_COLUMNS: DashboardColumns[] = [2, 3, 4]
export const DEFAULT_DASHBOARD_COLUMNS: DashboardColumns = 3

/**
 * The setting is an upper bound: narrow windows still step down, so cards stay readable on a laptop
 * or half a screen. Every class is spelled out because Tailwind ships only the names it finds in the
 * source — a built-up `xl:grid-cols-${n}` would leave the grid one column wide.
 */
const CLASSES: Record<DashboardColumns, string> = {
  2: 'grid gap-4 md:grid-cols-2',
  3: 'grid gap-4 md:grid-cols-2 xl:grid-cols-3',
  4: 'grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4',
}

export function gridClass(columns: DashboardColumns): string {
  return CLASSES[columns] ?? CLASSES[DEFAULT_DASHBOARD_COLUMNS]
}
