import type { RoleScope } from "@/domain/common";
import { INVENTORY_ENABLED } from "@/features/inventory/inventory-feature";
import { DELIVERY_PHOTOS_ENABLED } from "@/features/delivery-photos/delivery-photo-feature";

export type WorkMode = "customer" | "delivery" | "sales" | "inventory";
export type SchoolWorkMode = "delivery" | "sales";
export type ShellView = "schools" | "activity" | "settings";

export interface ShellNavigationItem {
  id: ShellView;
  label: string;
  icon: "home" | "camera" | "clipboard" | "settings";
}

const DELIVERY_NAVIGATION: readonly ShellNavigationItem[] = [
  { id: "schools", label: "학교", icon: "home" },
  { id: "settings", label: "설정", icon: "settings" },
];

const CUSTOMER_NAVIGATION: readonly ShellNavigationItem[] = [
  { id: "schools", label: "거래처", icon: "home" },
  { id: "settings", label: "설정", icon: "settings" },
];

const CUSTOMER_DELIVERY_PHOTO_NAVIGATION: readonly ShellNavigationItem[] = [
  { id: "schools", label: "거래처", icon: "home" },
  { id: "activity", label: "납품사진", icon: "camera" },
  { id: "settings", label: "설정", icon: "settings" },
];

const SALES_NAVIGATION: readonly ShellNavigationItem[] = [
  { id: "schools", label: "학교", icon: "home" },
  { id: "activity", label: "활동", icon: "clipboard" },
  { id: "settings", label: "설정", icon: "settings" },
];

const INVENTORY_NAVIGATION: readonly ShellNavigationItem[] = [
  { id: "schools", label: "재고", icon: "home" },
  { id: "settings", label: "설정", icon: "settings" },
];

export function isSchoolWorkMode(mode: unknown): mode is SchoolWorkMode {
  return mode === "delivery" || mode === "sales";
}

export function isWorkMode(mode: unknown): mode is WorkMode {
  return mode === "customer" || mode === "inventory" || isSchoolWorkMode(mode);
}

export function getAvailableModes(roleScopes: readonly RoleScope[], inventoryEnabled = INVENTORY_ENABLED): readonly WorkMode[] {
  const modes: WorkMode[] = ["customer"];
  if (roleScopes.includes("delivery")) modes.push("delivery");
  if (roleScopes.includes("sales")) modes.push("sales");
  if (modes.length === 1) modes.push("delivery");
  if (inventoryEnabled && roleScopes.length > 0) modes.push("inventory");
  return modes;
}

export function getInitialMode(
  roleScopes: readonly RoleScope[],
  preferredMode?: string | null,
  inventoryEnabled = INVENTORY_ENABLED,
): WorkMode {
  const modes = getAvailableModes(roleScopes, inventoryEnabled);
  if (isWorkMode(preferredMode) && modes.includes(preferredMode)) {
    return preferredMode;
  }
  // Retain the established first-login policy and saved delivery/sales values.
  return modes.find((mode) => mode !== "customer") ?? "customer";
}

export function getNavigation(mode: WorkMode, deliveryPhotosEnabled = DELIVERY_PHOTOS_ENABLED): readonly ShellNavigationItem[] {
  return mode === "inventory" ? INVENTORY_NAVIGATION : mode === "customer" ? (deliveryPhotosEnabled ? CUSTOMER_DELIVERY_PHOTO_NAVIGATION : CUSTOMER_NAVIGATION) : mode === "sales" ? SALES_NAVIGATION : DELIVERY_NAVIGATION;
}

export function normalizeView(mode: WorkMode, view: ShellView, deliveryPhotosEnabled = DELIVERY_PHOTOS_ENABLED): ShellView {
  return getNavigation(mode, deliveryPhotosEnabled).some((item) => item.id === view) ? view : "schools";
}
