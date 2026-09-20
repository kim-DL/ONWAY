import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  services: vi.fn(), call: vi.fn(), authListener: undefined as undefined | ((user: { uid: string } | null) => void),
}));
vi.mock("client-only", () => ({}));
vi.mock("@/lib/firebase/client", () => ({ getFirebaseClientServices: sdk.services }));
vi.mock("firebase/functions", () => ({ httpsCallable: (_functions: unknown, name: string) => (input: unknown) => sdk.call(name, input) }));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: (_auth: unknown, callback: (user: { uid: string } | null) => void) => {
  sdk.authListener = callback; return () => { sdk.authListener = undefined; };
} }));

import { customerDraftSchema, customerSchema, getCustomerChoseong, normalizeCustomerName, type SaveCustomerInput } from "@/domain/customer";
import { customerErrorMessage, customerRepository } from "./customer-repository";

const customer = customerSchema.parse({
  customerId: "one", companyId: "onnuri", name: "강은유통", normalizedName: normalizeCustomerName("강은유통"), choseongName: getCustomerChoseong("강은유통"),
  district: "서구", administrativeDong: "탄방동", officialAddress: "", deliveryAddress: "", accessPassword: "00123*", accessPasswordState: "registered",
  deliveryLocationDescription: "후문", deliveryPoint: null, contacts: [], status: "active", noticeType: "new", changeNote: "", revision: 1,
  createdAt: "2026-09-06T00:00:00.000Z", updatedAt: "2026-09-06T00:00:00.000Z", createdBy: "ADMIN", updatedBy: "ADMIN",
});
let auth: { currentUser: { uid: string } | null };
let page: EventTarget & { visibilityState: string };
let viewport: EventTarget;
let connection: { onLine: boolean };
const cleanups: Array<() => void> = [];
beforeEach(() => {
  vi.useFakeTimers(); sdk.call.mockReset();
  auth = { currentUser: { uid: "one" } };
  sdk.services.mockReturnValue({ auth, functions: {} });
  page = Object.assign(new EventTarget(), { visibilityState: "visible" });
  viewport = new EventTarget(); connection = { onLine: true };
  vi.stubGlobal("document", page); vi.stubGlobal("window", viewport); vi.stubGlobal("navigator", connection);
  sdk.call.mockResolvedValue({ data: { customers: [customer], nextCursor: null } });
});
afterEach(() => { cleanups.splice(0).forEach((cleanup) => cleanup()); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("sensitive customer repository lifecycle", () => {
  it("loads paginated results without storing them or accepting company input", async () => {
    sdk.call.mockResolvedValueOnce({ data: { customers: [customer], nextCursor: "one" } })
      .mockResolvedValueOnce({ data: { customers: [{ ...customer, customerId: "two" }], nextCursor: null } });
    expect(await customerRepository.list()).toHaveLength(2);
    expect(sdk.call.mock.calls).toEqual([["listCustomers", { afterId: null, includeOverviewPhoto: true }], ["listCustomers", { afterId: "one", includeOverviewPhoto: true }]]);
  });
  it("discards responses after a logout or user switch", async () => {
    let resolve!: (value: unknown) => void;
    sdk.call.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const request = customerRepository.list();
    auth.currentUser = null;
    resolve({ data: { customers: [customer], nextCursor: null } });
    await expect(request).rejects.toMatchObject({ code: "unauthenticated" });
  });
  it("requests optional photo metadata and preserves a photo replacement in saves", async () => {
    const draft = customerDraftSchema.parse(Object.fromEntries(
      Object.keys(customerDraftSchema.shape).map((key) => [key, customer[key as keyof typeof customer]]),
    ));
    const input: SaveCustomerInput = { requestId: "fed0b3f0-5b10-41d1-9bc3-e67d304fd283", customerId: null, expectedRevision: null,
      draft, clearNotice: false, photoChange: { action: "replace", uploadId: "2c585413-7cdb-4cde-a6e7-0c2cfc34fd2f" } };
    const saved = { ...customer, overviewPhoto: { photoId: input.photoChange!.action === "replace" ? input.photoChange!.uploadId : "", width: 640, height: 480 } };
    sdk.call.mockResolvedValueOnce({ data: saved });
    expect(await customerRepository.save(input)).toEqual(saved);
    expect(sdk.call).toHaveBeenCalledWith("saveCustomer", { ...input, includeOverviewPhoto: true });

    let resolve!: (value: unknown) => void;
    sdk.call.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const pending = customerRepository.save(input);
    auth.currentUser = { uid: "different-employee" };
    resolve({ data: saved });
    await expect(pending).rejects.toMatchObject({ code: "unauthenticated" });
  });
  it("does not deliver a late response after unsubscribe", async () => {
    let resolve!: (value: unknown) => void;
    sdk.call.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const receive = vi.fn(); const error = vi.fn();
    const stop = customerRepository.subscribe(receive, error); stop();
    resolve({ data: { customers: [customer], nextCursor: null } });
    await vi.advanceTimersByTimeAsync(0);
    expect(receive).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it("clears sensitive memory on offline and authentication changes", async () => {
    const receive = vi.fn(); const error = vi.fn();
    cleanups.push(customerRepository.subscribe(receive, error));
    await vi.advanceTimersByTimeAsync(0);
    expect(receive).toHaveBeenLastCalledWith([customer]);
    connection.onLine = false; viewport.dispatchEvent(new Event("offline"));
    expect(receive).toHaveBeenLastCalledWith([]); expect(error).toHaveBeenCalled();
    auth.currentUser = null; sdk.authListener?.(null);
    expect(receive).toHaveBeenLastCalledWith([]);
  });
  it("revalidates on focus while avoiding overlapping and hidden-page polling", async () => {
    cleanups.push(customerRepository.subscribe(vi.fn(), vi.fn()));
    await vi.advanceTimersByTimeAsync(0);
    page.visibilityState = "hidden";
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sdk.call).toHaveBeenCalledTimes(1);
    page.visibilityState = "visible"; page.dispatchEvent(new Event("visibilitychange")); viewport.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(0);
    expect(sdk.call).toHaveBeenCalledTimes(2);
  });
  it("renders safe localized errors and never returns backend input strings", () => {
    expect(customerErrorMessage({ code: "functions/aborted", message: "00123*" })).toContain("다른 직원이");
    expect(customerErrorMessage({ message: "00123* 01012345678" })).not.toContain("00123");
    expect(customerErrorMessage({ message: "00123* 01012345678" })).not.toContain("0101234");
  });
  it("reports an initial offline connection rather than leaving the UI loading", async () => {
    connection.onLine = false;
    const receive = vi.fn(); const error = vi.fn();
    cleanups.push(customerRepository.subscribe(receive, error));
    await vi.advanceTimersByTimeAsync(0);
    expect(receive).toHaveBeenCalledWith([]); expect(error).toHaveBeenCalledTimes(1); expect(sdk.call).not.toHaveBeenCalled();
  });
  it("immediately revalidates a reconnect that occurred while the old request was pending", async () => {
    let resolve!: (value: unknown) => void;
    sdk.call.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const receive = vi.fn();
    cleanups.push(customerRepository.subscribe(receive, vi.fn()));
    connection.onLine = false; viewport.dispatchEvent(new Event("offline"));
    connection.onLine = true; viewport.dispatchEvent(new Event("online"));
    resolve({ data: { customers: [customer], nextCursor: null } });
    await vi.advanceTimersByTimeAsync(0);
    expect(sdk.call).toHaveBeenCalledTimes(2);
    expect(receive).toHaveBeenLastCalledWith([customer]);
  });
});
