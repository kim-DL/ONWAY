"use client";

import "client-only";

import { onAuthStateChanged } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { z } from "zod";

import {
  customerListPageSchema, customerLocationCandidateSchema, customerRegionSchema,
  customerSchema, saveCustomerInputSchema,
  type Customer, type CustomerPoint, type CustomerRegion, type LocationCandidate, type SaveCustomerInput,
} from "@/domain/customer";
import { getFirebaseClientServices } from "@/lib/firebase/client";
import { REVALIDATION_TTL_MS, type RevalidationFreshness } from "@/lib/revalidation-coordinator";

import {
  beginCustomerCatalogRead, commitCustomerCatalogRead, discardCustomerWorkspaceCatalog,
  getCustomerRevalidationCoordinator, updateCustomerCatalogFreshness,
} from "./customer-workspace-snapshot";

export type CustomerRevalidationState = { status: RevalidationFreshness; lastSuccessAt: number | null };

export function customerErrorMessage(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code.endsWith("aborted")) return "다른 직원이 먼저 수정했어요. 목록을 새로 확인한 뒤 다시 수정해주세요.";
  if (code.endsWith("permission-denied") || code.endsWith("unauthenticated") || code.endsWith("failed-precondition")) {
    return "사용 권한을 확인하지 못했어요. 다시 로그인하거나 관리자에게 확인해주세요.";
  }
  if (code.endsWith("invalid-argument")) return "입력한 거래처 정보를 다시 확인해주세요.";
  if (code.endsWith("not-found")) return "거래처 정보가 변경되었어요. 목록을 다시 불러와주세요.";
  if (code.endsWith("resource-exhausted")) return "요청이 많아 잠시 쉬고 있어요. 잠시 후 다시 시도해주세요.";
  if (typeof navigator !== "undefined" && !navigator.onLine) return "인터넷 연결 후 다시 시도해주세요. 거래처 정보는 기기에 저장하지 않아요.";
  return "거래처 정보를 불러오거나 저장하지 못했어요. 잠시 후 다시 시도해주세요.";
}

function servicesForCustomer() {
  const services = getFirebaseClientServices();
  if (!services?.auth.currentUser) throw Object.assign(new Error("Customer authentication required."), { code: "unauthenticated" });
  return services;
}

async function list(): Promise<Customer[]> {
  const services = servicesForCustomer();
  const uid = services.auth.currentUser!.uid;
  const callable = httpsCallable<{ afterId: string | null; includeOverviewPhoto: boolean }, unknown>(services.functions, "listCustomers");
  const customers: Customer[] = [];
  let afterId: string | null = null;
  const seen = new Set<string>();
  do {
    const result = customerListPageSchema.parse((await callable({ afterId, includeOverviewPhoto: true })).data);
    if (services.auth.currentUser?.uid !== uid) throw Object.assign(new Error("Customer session changed."), { code: "unauthenticated" });
    for (const customer of result.customers) {
      if (!seen.has(customer.customerId)) {
        customers.push(customer);
        seen.add(customer.customerId);
      }
    }
    if (result.nextCursor === afterId && afterId !== null) throw new Error("Invalid customer cursor.");
    afterId = result.nextCursor;
    // Internal company scale is hundreds. Reject rather than silently truncate
    // an unexpectedly unbounded response or retain megabytes of sensitive data.
    if (afterId && customers.length >= 5_000) throw Object.assign(new Error("Customer list limit."), { code: "resource-exhausted" });
  } while (afterId);
  return customers;
}

function subscribe(namespace: string, onData: (customers: Customer[], refreshedAt: number) => void,
  onError: (error: unknown, hadData: boolean) => void,
  onFreshness: (state: CustomerRevalidationState) => void = () => undefined,
  options: { hasData?: boolean; forceInitial?: boolean } = {}): () => void {
  const services = getFirebaseClientServices();
  if (!services?.auth.currentUser) {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) onError(Object.assign(new Error("Customer authentication required."), { code: "unauthenticated" }), false); });
    return () => { cancelled = true; };
  }
  const uid = services.auth.currentUser.uid;
  const coordinator = getCustomerRevalidationCoordinator(namespace);
  let closed = false;
  let terminal = false;
  let pending = false;
  let loaded = options.hasData === true;
  let generation = 0;
  let queuedForce = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => {
    generation += 1;
    loaded = false;
    discardCustomerWorkspaceCatalog(namespace);
    if (!closed) { onData([], Date.now()); onFreshness({ status: "idle", lastSuccessAt: null }); }
    clearTimeout(timer);
  };
  const schedule = () => {
    clearTimeout(timer);
    const remaining = coordinator.remainingTtl(loaded);
    timer = setTimeout(() => void refresh(), remaining > 0 ? remaining : REVALIDATION_TTL_MS);
  };
  const refresh = async (force = false) => {
    if (closed || terminal || pending || document.visibilityState === "hidden" || !navigator.onLine) return;
    const run = coordinator.run(async () => {
      const writeGeneration = beginCustomerCatalogRead(namespace);
      return { customers: await list(), writeGeneration };
    }, { force, hasData: loaded });
    if (run.kind === "skipped") { schedule(); return; }
    if (force && run.kind === "joined") queuedForce = true;
    pending = true;
    const requestGeneration = generation;
    clearTimeout(timer);
    if (loaded && run.kind === "started") {
      updateCustomerCatalogFreshness(namespace, "refreshing", coordinator.getLastSuccessAt());
      onFreshness({ status: "refreshing", lastSuccessAt: coordinator.getLastSuccessAt() });
    }
    try {
      const result = await run.promise;
      if (generation === requestGeneration && services.auth.currentUser?.uid === uid) {
        loaded = true;
        const refreshedAt = coordinator.getLastSuccessAt() ?? Date.now();
        const customers = commitCustomerCatalogRead(namespace, result.customers, refreshedAt, result.writeGeneration);
        if (!closed && customers) {
          onData(customers, refreshedAt);
          onFreshness({ status: "fresh", lastSuccessAt: refreshedAt });
        }
      }
    } catch (error) {
      if (!closed && generation === requestGeneration) {
        const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
        const invalidSession = ["permission-denied", "unauthenticated", "failed-precondition"].some((reason) => code.endsWith(reason));
        if (invalidSession) { terminal = true; clear(); }
        else {
          updateCustomerCatalogFreshness(namespace, loaded ? "stale-error" : "idle", coordinator.getLastSuccessAt());
          onFreshness({ status: loaded ? "stale-error" : "idle", lastSuccessAt: coordinator.getLastSuccessAt() });
        }
        onError(error, loaded && !invalidSession);
      }
    } finally {
      pending = false;
      if (!closed && queuedForce && services.auth.currentUser?.uid === uid && navigator.onLine) {
        queuedForce = false;
        void refresh(true);
      } else if (!closed && requestGeneration !== generation && services.auth.currentUser?.uid === uid
        && navigator.onLine && document.visibilityState === "visible") {
        // A reconnect can occur while the previous request is still settling.
        // Revalidate immediately instead of leaving an empty view for a minute.
        void refresh();
      } else if (!closed) schedule();
    }
  };
  const onVisibility = () => { if (document.visibilityState === "visible") void refresh(); };
  const onOffline = () => {
    clear();
    onError(Object.assign(new Error("Customer connection unavailable."), { code: "unavailable" }), false);
  };
  const onOnline = () => void refresh();
  const stopAuth = onAuthStateChanged(services.auth, (user) => {
    if (user?.uid !== uid) { terminal = true; clear(); }
  });
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("focus", onOnline);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  if (navigator.onLine) void refresh(options.forceInitial === true);
  else queueMicrotask(() => { if (!closed) onOffline(); });
  return () => {
    closed = true;
    clearTimeout(timer);
    stopAuth();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("focus", onOnline);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
  };
}

async function save(input: SaveCustomerInput): Promise<Customer> {
  const services = servicesForCustomer();
  const uid = services.auth.currentUser!.uid;
  const response = await httpsCallable<SaveCustomerInput, unknown>(services.functions, "saveCustomer")(saveCustomerInputSchema.parse({ ...input, includeOverviewPhoto: true }));
  if (services.auth.currentUser?.uid !== uid) throw Object.assign(new Error("Customer session changed."), { code: "unauthenticated" });
  return customerSchema.parse(response.data);
}

async function searchLocations(query: string): Promise<LocationCandidate[]> {
  const services = servicesForCustomer();
  const response = await httpsCallable<{ query: string }, unknown>(services.functions, "searchCustomerLocations")({ query });
  return z.array(customerLocationCandidateSchema).max(16).parse(response.data);
}

async function reverseLocation(point: CustomerPoint): Promise<CustomerRegion> {
  const services = servicesForCustomer();
  const response = await httpsCallable<CustomerPoint, unknown>(services.functions, "reverseCustomerLocation")(point);
  return customerRegionSchema.parse(response.data);
}

export const customerRepository = { list, subscribe, save, searchLocations, reverseLocation };
