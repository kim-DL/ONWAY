import { useSyncExternalStore } from "react";
import { getCustomerChoseong, normalizeCustomerName, type Customer } from "../../../src/domain/customer";
import type { AuthenticatedSession } from "../../../src/features/auth/auth-context";
import { deliveryPhotoDateKey, type DeliveryPhotoSnapshot } from "../../../src/features/delivery-photos/delivery-photo-memory";
import { DEFAULT_DELIVERY_VEHICLE, DEFAULT_ORIGIN_ADDRESS } from "../../../src/domain/delivery-planning";

type SaveInput = { requestId: string; expectedRevision: number | null; customerIds: string[] };
type SaveRequest = SaveInput & { mode: "route" | "day" };

declare global {
  interface Window {
    __deliveryPhotoEditorFixture: {
      requests: SaveRequest[];
      externalUpdate: () => void;
      serverIds: () => string[];
    };
  }
}

export const session: AuthenticatedSession = { uid: "editor-fixture", displayName: "합성 직원", claims: {
  employeeId: "EDITOR-FIXTURE", roleScopes: ["delivery"], sessionVersion: 1, permissionsVersion: 1,
} };
export const customers: Customer[] = ["가람상회", "나래상회", "다온상회"].map((name, index) => ({
  customerId: `EDITOR-${index}`, companyId: "onnuri", name, normalizedName: normalizeCustomerName(name), choseongName: getCustomerChoseong(name),
  district: "서구", administrativeDong: "둔산1동", officialAddress: "", deliveryAddress: "", deliveryPoint: null,
  accessPassword: "", accessPasswordState: "none", deliveryLocationDescription: "", contacts: [], status: "active",
  noticeType: "none", changeNote: "", revision: 1, createdAt: "2026-11-04T00:00:00.000Z", updatedAt: "2026-11-04T00:00:00.000Z",
  createdBy: "EDITOR-FIXTURE", updatedBy: "EDITOR-FIXTURE", overviewPhoto: null,
}));

const params = new URLSearchParams(location.search);
const mode = params.get("mode") === "day" ? "day" : "route";
const absent = params.has("absent");
const ids = customers.map((customer) => customer.customerId);
const date = deliveryPhotoDateKey();
const route = (revision: number, customerIds: string[]) => ({ employeeId: session.claims.employeeId, customerIds,
  revision, updatedAt: "2026-11-04T00:00:00.000Z", updatedByEmployeeId: session.claims.employeeId });
let snapshot: DeliveryPhotoSnapshot = {
  route: mode === "route" && absent ? null : route(1, ids.slice(0, 2)),
  day: { deliveryDateKey: date, customerIds: ids.slice(0, 2), revision: mode === "day" && absent ? null : 1,
    isOverride: !(mode === "day" && absent) },
  today: { scope: "today", deliveryDateKey: date, truncated: false, photos: [], customers: [] }, refreshedAt: Date.now(),
};
let serverRevision = absent ? null : 1;
let serverIds = absent && mode === "route" ? [] : ids.slice(0, 2);
const requests: SaveRequest[] = [];
const listeners = new Set<() => void>();
const publish = () => { for (const listener of listeners) listener(); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const refresh = () => { snapshot = { ...snapshot }; publish(); };
const accept = (update: (current: DeliveryPhotoSnapshot) => DeliveryPhotoSnapshot) => { snapshot = update(snapshot); publish(); };

window.__deliveryPhotoEditorFixture = {
  requests,
  serverIds: () => serverIds,
  externalUpdate: () => {
    serverRevision = (serverRevision ?? 0) + 1;
    serverIds = [...ids];
    snapshot = mode === "route" ? { ...snapshot, route: route(serverRevision, [...ids]) }
      : { ...snapshot, day: { ...snapshot.day, revision: serverRevision, customerIds: [...ids], isOverride: true } };
    publish();
  },
};

export function useDeliveryPhotoData() {
  const current = useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
  return { snapshot: current, loading: false, error: "", refresh, accept, clear() {} };
}
export function useDeliveryPhotoCatalog() { return { customers, status: "ready", retry() {} }; }
export function useDeliveryPhotoUploads() {
  return { coordinator: null, jobs: [], byCustomer: new Map(), pendingByCustomer: new Map(), retryByCustomer: new Map(), ready: false, storageError: false };
}
async function save(input: SaveInput, target: "route" | "day") {
  requests.push({ ...input, customerIds: [...input.customerIds], mode: target });
  if (input.expectedRevision !== serverRevision) throw Object.assign(new Error("Revision conflict"), { code: "functions/aborted" });
  serverRevision = (serverRevision ?? 0) + 1;
  serverIds = [...input.customerIds];
  return target === "route" ? route(serverRevision, serverIds)
    : { ...snapshot.day, revision: serverRevision, customerIds: serverIds, isOverride: true };
}
export const deliveryPhotoRepository = { saveRoute: (input: SaveInput) => save(input, "route"), saveDay: (input: SaveInput) => save(input, "day") };
export const deliveryPhotoErrorKind = (error: { code?: string }) => error.code === "functions/aborted" ? "conflict" : "temporary";

let recommendedIds: string[] = [];
export const planningError = (error: Error) => error.message;
export const planningRepository = {
  context: async () => ({ canConfigure: false, settings: { revision: 1, originAddress: DEFAULT_ORIGIN_ADDRESS,
    originPoint: { latitude: 36.3, longitude: 127.4 }, vehicle: DEFAULT_DELIVERY_VEHICLE } }),
  recommend: async ({ lastCustomerId }: { lastCustomerId: string }) => {
    recommendedIds = [...snapshot.day.customerIds.filter((id) => id !== lastCustomerId).reverse(), lastCustomerId];
    return { recommendationId: "fixture-recommendation", deliveryDateKey: date, customerIds: recommendedIds,
      totalSeconds: 600, totalMeters: 3000, calculatedAt: new Date().toISOString(), notice: "" };
  },
  apply: async () => save({ requestId: "fixture-apply", expectedRevision: serverRevision, customerIds: recommendedIds }, "day"),
};
