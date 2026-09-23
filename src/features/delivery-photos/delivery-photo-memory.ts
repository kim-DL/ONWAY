import type { DeliveryPhotoDayResult, DeliveryPhotoRouteResult, DeliveryPhotoTodayResult } from "./delivery-photo-repository";

export type DeliveryPhotoSnapshot = {
  route: DeliveryPhotoRouteResult;
  day: DeliveryPhotoDayResult;
  today: DeliveryPhotoTodayResult;
  refreshedAt: number;
};

let memory: { key: string; generation: number; snapshot: DeliveryPhotoSnapshot | null } | null = null;

export function deliveryPhotoDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function entry(key: string) {
  if (memory?.key !== key) memory = { key, generation: 0, snapshot: null };
  return memory;
}

export function readDeliveryPhotoSnapshot(key: string) { return entry(key).snapshot; }
export function beginDeliveryPhotoRead(key: string) { return entry(key).generation; }
export function commitDeliveryPhotoRead(key: string, generation: number, snapshot: DeliveryPhotoSnapshot) {
  if (memory?.key !== key || memory.generation !== generation) return memory?.key === key ? memory.snapshot : null;
  memory.snapshot = snapshot;
  return snapshot;
}
export function acceptDeliveryPhotoWrite(key: string, update: (current: DeliveryPhotoSnapshot) => DeliveryPhotoSnapshot) {
  if (memory?.key !== key) return null;
  memory.generation += 1;
  if (!memory.snapshot) return null;
  memory.snapshot = update(memory.snapshot);
  return memory.snapshot;
}
export function clearDeliveryPhotoSnapshot(key?: string) {
  if (memory && (!key || memory.key === key)) memory = null;
}
