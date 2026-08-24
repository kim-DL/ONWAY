import type { RoleScope } from "@/domain/common";

export type WorkMode = "delivery" | "sales";
export type ShellView = "schools" | "activity" | "settings";

export interface ShellNavigationItem {
  id: ShellView;
  label: string;
  icon: "home" | "clipboard" | "settings";
}

const DELIVERY_NAVIGATION: readonly ShellNavigationItem[] = [
  { id: "schools", label: "학교", icon: "home" },
  { id: "settings", label: "설정", icon: "settings" },
];

const SALES_NAVIGATION: readonly ShellNavigationItem[] = [
  { id: "schools", label: "학교", icon: "home" },
  { id: "activity", label: "활동", icon: "clipboard" },
  { id: "settings", label: "설정", icon: "settings" },
];

export function getAvailableModes(roleScopes: readonly RoleScope[]): readonly WorkMode[] {
  const modes: WorkMode[] = [];
  if (roleScopes.includes("delivery")) modes.push("delivery");
  if (roleScopes.includes("sales")) modes.push("sales");
  if (modes.length === 0) modes.push("delivery");
  return modes;
}

export function getInitialMode(
  roleScopes: readonly RoleScope[],
  preferredMode?: string | null,
): WorkMode {
  const modes = getAvailableModes(roleScopes);
  if ((preferredMode === "delivery" || preferredMode === "sales") && modes.includes(preferredMode)) {
    return preferredMode;
  }
  return modes[0] ?? "delivery";
}

export function getNavigation(mode: WorkMode): readonly ShellNavigationItem[] {
  return mode === "sales" ? SALES_NAVIGATION : DELIVERY_NAVIGATION;
}

export function normalizeView(mode: WorkMode, view: ShellView): ShellView {
  return getNavigation(mode).some((item) => item.id === view) ? view : "schools";
}
