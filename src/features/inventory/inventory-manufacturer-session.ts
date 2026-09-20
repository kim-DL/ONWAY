import { registerInventorySessionMemoryClear } from "./inventory-workspace-snapshot";

type RecentManufacturer = { manufacturerId: string; name: string };
let currentNamespace = "";
let recent: RecentManufacturer[] = [];

export function clearRecentInventoryManufacturers() { currentNamespace = ""; recent = []; }
registerInventorySessionMemoryClear(clearRecentInventoryManufacturers);

function enter(namespace: string) {
  if (currentNamespace !== namespace) { currentNamespace = namespace; recent = []; }
}
export function readRecentInventoryManufacturers(namespace: string) { enter(namespace); return recent; }
export function rememberInventoryManufacturer(namespace: string, manufacturer: RecentManufacturer) {
  enter(namespace);
  recent = [{ manufacturerId: manufacturer.manufacturerId, name: manufacturer.name },
    ...recent.filter((item) => item.manufacturerId !== manufacturer.manufacturerId)].slice(0, 5);
}
