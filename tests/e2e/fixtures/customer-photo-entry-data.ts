import { useState, useSyncExternalStore } from "react";
import type { DeliveryPhotoMetadata } from "../../../src/domain/delivery-photo";
import { deliveryPhotoDateKey } from "../../../src/features/delivery-photos/delivery-photo-memory";
import { customers as baseCustomers, useDeliveryPhotoData as baseDeliveryPhotoData } from "./customer-ceramic-data";

export * from "./customer-ceramic-data";

type CaptureEvent = { customerId: string; source: "camera" | "album"; fileName?: string };
declare global {
  interface Window {
    __customerPhotoEntryFixture: {
      captures: CaptureEvent[];
      listRequests: string[];
      writes: string[];
      releaseHistory: () => void;
      setUploadReady: (ready: boolean) => void;
    };
  }
}

const params = new URLSearchParams(location.search);
const customers = baseCustomers.map((customer, index) => index ? customer : {
  ...customer,
  name: params.has("longName") ? "아주 긴 예시 거래처 이름과 지점을 함께 표시하는 합성 거래처" : customer.name,
  status: params.has("closed") ? "closed" as const : customer.status,
});
const today = deliveryPhotoDateKey();
const createdAt = new Date(`${today}T10:32:00+09:00`).toISOString();
const photo: DeliveryPhotoMetadata = {
  photoId: "fixture-photo-1", customerId: customers[0]!.customerId, deliveryDateKey: today,
  source: "camera", createdAt, createdByEmployeeId: "PREVIEW", createdByName: "예시 직원",
  expiresAt: new Date(Date.parse(createdAt) + 7 * 86400000).toISOString(), thumbnail: { width: 160, height: 120 },
};
let releaseHistory: () => void = () => undefined;
const historyReady = new Promise<void>(resolve => { releaseHistory = resolve; });
let uploadReady = !params.has("uploadLoading");
const listeners = new Set<() => void>();
window.__customerPhotoEntryFixture = {
  captures: [], listRequests: [], writes: [], releaseHistory,
  setUploadReady: (ready) => { uploadReady = ready; for (const listener of listeners) listener(); },
};

export function useCustomers() {
  return { customers, status: "ready", canRetainDraft: true, message: "", retry() {}, accept() {} };
}
export function useRecentCustomers() {
  const [recentCustomers, setRecent] = useState(customers);
  return { recentCustomers, ready: true, rememberCustomer() {}, clearRecentCustomers() { setRecent([]); } };
}
export function useDeliveryPhotoCatalog() {
  return { customers: params.has("missingTarget") ? customers.slice(1) : customers, status: "ready", retry() {} };
}
export function useDeliveryPhotoData() {
  const data = baseDeliveryPhotoData();
  return params.has("targetOnly") ? { ...data, snapshot: { ...data.snapshot,
    day: { ...data.snapshot.day, customerIds: [customers[0]!.customerId], isOverride: true } } } : data;
}

const coordinator = {
  canBegin: () => uploadReady,
  begin(customerId: string, source: "camera" | "album") {
    window.__customerPhotoEntryFixture.captures.push({ customerId, source });
    return { jobId: "fixture-capture" };
  },
  async acceptNativeSource(_jobId: string, file: File) {
    const event = window.__customerPhotoEntryFixture.captures.at(-1);
    if (event) event.fileName = file.name;
  },
  peekPreview: () => null,
};
export function useDeliveryPhotoUploads() {
  const ready = useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => uploadReady, () => uploadReady);
  return { coordinator: ready ? coordinator : null, jobs: [], byCustomer: new Map(), pendingByCustomer: new Map(), retryByCustomer: new Map(), ready, storageError: false };
}

export const deliveryPhotoHistoryRepository = {
  async list(customerId: string) {
    window.__customerPhotoEntryFixture.listRequests.push(customerId);
    if (params.get("history") === "loading") await historyReady;
    if (params.get("history") === "error") throw new Error("synthetic history unavailable");
    return { scope: "customer" as const, customerId, fromDateKey: deliveryPhotoDateKey(new Date(Date.now() - 6 * 86400000)),
      photos: params.get("history") === "empty" ? [] : [{ ...photo, customerId }] };
  },
  async load() { return new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="160" height="120" fill="#dce5ef"/></svg>'], { type: "image/svg+xml" }); },
};
export const deliveryPhotoHistoryErrorMessage = () => "사진을 불러오지 못했어요.";
export async function blockedWrite() {
  window.__customerPhotoEntryFixture.writes.push("blocked");
  throw new Error("Production writes are disabled in the photo entry fixture");
}
export const customerRepository = { save: blockedWrite, reverseLocation: blockedWrite, searchLocation: blockedWrite };

