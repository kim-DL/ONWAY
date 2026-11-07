import { useState } from "react";
import { getCustomerChoseong, normalizeCustomerName, type Customer } from "../../../src/domain/customer";
import type { AuthenticatedSession } from "../../../src/features/auth/auth-context";
import { deliveryPhotoDateKey } from "../../../src/features/delivery-photos/delivery-photo-memory";

export const session = { uid: "ceramic-preview", displayName: "예시 직원", claims: {
  employeeId: "PREVIEW", companyId: "onnuri", roleScopes: ["delivery", "sales"], sessionVersion: 1, permissionsVersion: 1,
} } as AuthenticatedSession;
export const customers: Customer[] = [..."가나다라마바사아자차카타"].map((suffix) => `예시 거래처 ${suffix}`).map((name, index) => ({
  customerId: `PREVIEW-${index}`, companyId: "onnuri", name, normalizedName: normalizeCustomerName(name), choseongName: getCustomerChoseong(name),
  district: "서구", administrativeDong: "둔산1동", officialAddress: "대전광역시 서구 예시로 1", deliveryAddress: "대전광역시 서구 예시로 1",
  accessPassword: "", accessPasswordState: "none", deliveryLocationDescription: "예시 납품 안내", deliveryPoint: null,
  contacts: [], status: "active", noticeType: "none", changeNote: "", revision: 1,
  createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z", createdBy: "PREVIEW", updatedBy: "PREVIEW", overviewPhoto: null,
}));
export function useCustomers() {
  const params = new URLSearchParams(location.search);
  const status = params.has("error") ? "error" : params.has("loading") ? "loading" : "ready";
  return { customers: status === "ready" ? customers : [], status, canRetainDraft: status === "ready", message: "미리보기용 목록 오류", retry() {}, accept() {} };
}
export function useRecentCustomers() {
  const [recentCustomers, setRecent] = useState(customers);
  return { recentCustomers, ready: true, rememberCustomer() {}, clearRecentCustomers() { setRecent([]); } };
}
export const blockedWrite = async () => { throw Object.assign(new Error("미리보기에서는 저장하지 않습니다."), { code: "failed-precondition" }); };
export const customerRepository = { save: blockedWrite, reverseLocation: blockedWrite, searchLocation: blockedWrite };
export const customerErrorMessage = () => "미리보기에서는 조회·저장을 서버에 요청하지 않습니다.";
export function useDeliveryPhotoData() {
  const deliveryDateKey = deliveryPhotoDateKey();
  const customerIds = new URLSearchParams(location.search).has("photoSamples") ? customers.slice(0, 8).map(customer => customer.customerId) : [];
  return { snapshot: { route: null, day: { deliveryDateKey, revision: 1, isOverride: customerIds.length > 0, customerIds },
    today: { deliveryDateKey, customers: [], truncated: false }, refreshedAt: Date.now() }, loading: false, error: "", clear() {}, accept() {}, refresh() {} };
}
export function useDeliveryPhotoCatalog() { return { customers, status: "ready", retry() {} }; }
export function useDeliveryPhotoUploads() {
  return { coordinator: null, jobs: [], byCustomer: new Map(), pendingByCustomer: new Map(), retryByCustomer: new Map(), ready: false, storageError: false };
}
