import type { ShellView, WorkMode } from "./shell-policy";

export type DeliveryPhotoEntry = { customerId: string };

export type CustomerNavigationContext =
  | { kind: "detail"; customerId: string }
  | { kind: "photo-record"; customerId: string };

export function readCustomerNavigationContext(value: unknown, mode: WorkMode, view: ShellView): CustomerNavigationContext | null {
  if (mode !== "customer" || !value || typeof value !== "object") return null;
  const context = value as { kind?: unknown; customerId?: unknown };
  if (typeof context.customerId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(context.customerId)) return null;
  if ((view === "schools" && context.kind === "detail") || (view === "activity" && context.kind === "photo-record")) {
    return { kind: context.kind, customerId: context.customerId };
  }
  return null;
}
