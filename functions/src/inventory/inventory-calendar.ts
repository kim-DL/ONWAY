import { inventoryDateSchema, inventorySettingsSchema, type InventoryCycle, type InventorySettings } from "./inventory-contract.js";

const DAY = 86_400_000;
export function inventoryToday(now: Date): string {
  // Asia/Seoul has a fixed +09:00 offset for the app's supported dates.
  return new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}
function day(date: string): number { return Date.parse(`${inventoryDateSchema.parse(date)}T00:00:00Z`); }
function date(value: number): string { return new Date(value).toISOString().slice(0, 10); }
export function defaultInventorySettings(): InventorySettings {
  return inventorySettingsSchema.parse({ weekday: 5, urgentDays: 100, revision: 0, pendingWeekday: null, effectiveDate: null,
    pendingCycleStartDate: null, updatedAt: null, updatedBy: null });
}
export function inventoryCycle(settings: InventorySettings, today: string): InventoryCycle {
  const effective = settings.effectiveDate !== null && settings.pendingWeekday !== null && today >= settings.effectiveDate;
  const weekday = effective ? settings.pendingWeekday! : settings.weekday;
  const todayMs = day(today);
  const daysSince = (new Date(todayMs).getUTCDay() - weekday + 7) % 7;
  let start = todayMs - daysSince * DAY;
  let next = start + 7 * DAY;
  // Preserve the old period until the first chosen weekday after its boundary.
  if (!effective && settings.effectiveDate && settings.pendingWeekday !== null) {
    const effectiveMs = day(settings.effectiveDate);
    const previousBoundary = effectiveMs - ((new Date(effectiveMs).getUTCDay() - settings.weekday + 7) % 7) * DAY;
    start = settings.pendingCycleStartDate ? day(settings.pendingCycleStartDate) : Math.min(start, previousBoundary - 7 * DAY);
    next = effectiveMs;
  }
  return { cycleId: `week-${date(start)}`, startDate: date(start), nextDate: date(next), weekday };
}
export function nextInventorySettings(current: InventorySettings, weekday: number, urgentDays: number, now: Date, employeeId: string): InventorySettings {
  const today = inventoryToday(now);
  const active = inventoryCycle(current, today);
  const baseWeekday = active.weekday;
  let effectiveDate: string | null = null;
  let pendingWeekday: number | null = null;
  let pendingCycleStartDate: string | null = null;
  const naturalBoundary = day(active.startDate) + 7 * DAY;
  const hasFutureChange = current.effectiveDate !== null && current.effectiveDate > today;
  // Cancelling a pending schedule after the original weekly boundary must not
  // suddenly switch cycle IDs and erase the visible completion badges.
  if (weekday !== baseWeekday || (hasFutureChange && day(today) >= naturalBoundary)) {
    const boundary = Math.max(naturalBoundary, day(today) + DAY);
    effectiveDate = date(boundary + ((weekday - new Date(boundary).getUTCDay() + 7) % 7) * DAY);
    pendingWeekday = weekday;
    pendingCycleStartDate = active.startDate;
  }
  return inventorySettingsSchema.parse({ weekday: baseWeekday, urgentDays, pendingWeekday, effectiveDate, pendingCycleStartDate,
    revision: current.revision + 1, updatedAt: now.toISOString(), updatedBy: employeeId });
}
