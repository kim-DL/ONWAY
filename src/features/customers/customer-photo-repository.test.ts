import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ services: vi.fn(), call: vi.fn(), optimize: vi.fn() }));
vi.mock("client-only", () => ({}));
vi.mock("@/lib/firebase/client", () => ({ getFirebaseClientServices: fixture.services }));
vi.mock("firebase/functions", () => ({ httpsCallable: (_services: unknown, name: string) => (input: unknown) => fixture.call(name, input) }));
vi.mock("../school-detail/photo-upload-optimizer", () => ({ PHOTO_SOURCE_MAX_BYTES: 30 * 1024 * 1024, optimizeSchoolPhoto: fixture.optimize }));
import { customerPhotoRepository, customerPhotoErrorMessage, isCustomerPhotoStageError, validateCustomerPhotoFile } from "./customer-photo-repository";

const photoId = "66558a67-cc4d-4000-8852-3b887f584ad0";
const bytes = Buffer.from("RIFFxxxxWEBPdata");
let claims: Record<string, unknown>; let user: { getIdTokenResult: ReturnType<typeof vi.fn> }; let auth: { currentUser: typeof user | null };
beforeEach(() => {
  vi.clearAllMocks();
  claims = { employeeId: "EMP", sessionVersion: 1, permissionsVersion: 1, roleScopes: ["delivery"] };
  user = { getIdTokenResult: vi.fn(async () => ({ claims })) }; auth = { currentUser: user };
  fixture.services.mockReturnValue({ auth, functions: {} });
  fixture.call.mockResolvedValue({ data: { fileBase64: bytes.toString("base64"), contentType: "image/webp", byteSize: bytes.length } });
  fixture.optimize.mockImplementation(async (file: File) => ({ file }));
  vi.stubGlobal("navigator", { onLine: true });
});
afterEach(() => vi.unstubAllGlobals());

describe("private customer photo repository", () => {
  it("distinguishes expired photo attachment from generic session authorization failure", () => {
    expect(isCustomerPhotoStageError({ code: "functions/failed-precondition", details: { reason: "customer-photo-stage" } })).toBe(true);
    expect(isCustomerPhotoStageError({ code: "failed-precondition", details: { reason: "customer-photo-stage" } })).toBe(true);
    for (const error of [null, new Error("customer-photo-stage"), { code: "failed-precondition" },
      { code: "permission-denied", details: { reason: "customer-photo-stage" } },
      { code: "failed-precondition", details: { reason: "session" } },
      { code: "failed-precondition", details: "customer-photo-stage" }]) expect(isCustomerPhotoStageError(error)).toBe(false);
  });
  it("returns in-memory Blob through authenticated callable only", async () => {
    const blob = await customerPhotoRepository.load("customer-one", photoId, { variant: "thumbnail" });
    expect(blob.type).toBe("image/webp"); expect(blob.size).toBe(bytes.length);
    expect(fixture.call).toHaveBeenCalledWith("getCustomerPhoto", { customerId: "customer-one", photoId, variant: "thumbnail" });
  });
  it.each(["logout", "permissions", "offline", "abort"])("discards late photo bytes after %s", async (cause) => {
    const controller = new AbortController();
    fixture.call.mockImplementationOnce(async () => {
      if (cause === "logout") auth.currentUser = null;
      if (cause === "permissions") claims = { ...claims, permissionsVersion: 2 };
      if (cause === "offline") vi.stubGlobal("navigator", { onLine: false });
      if (cause === "abort") controller.abort();
      return { data: { fileBase64: bytes.toString("base64"), contentType: "image/webp", byteSize: bytes.length } };
    });
    await expect(customerPhotoRepository.load("customer-one", photoId, { signal: controller.signal })).rejects.toBeInstanceOf(Error);
  });
  it("does not request a photo when already aborted or unauthenticated", async () => {
    auth.currentUser = null;
    await expect(customerPhotoRepository.load("one", photoId)).rejects.toMatchObject({ code: "unauthenticated" });
    const controller = new AbortController(); controller.abort();
    await expect(customerPhotoRepository.load("one", photoId, { signal: controller.signal })).rejects.toBeInstanceOf(Error);
    expect(fixture.call).not.toHaveBeenCalled();
  });
  it("rechecks logout that happens while the final token promise resolves", async () => {
    user.getIdTokenResult.mockResolvedValueOnce({ claims }).mockResolvedValueOnce({ claims }).mockImplementationOnce(async () => {
      auth.currentUser = null;
      return { claims };
    });
    await expect(customerPhotoRepository.load("one", photoId)).rejects.toMatchObject({ code: "unauthenticated" });
  });
  it("rejects unsafe payload shape, wrong byte length and wrong magic", async () => {
    for (const data of [
      { contentType: "image/webp", byteSize: bytes.length, fileBase64: bytes.toString("base64"), url: "https://public.test/image" },
      { contentType: "image/webp", byteSize: 999, fileBase64: bytes.toString("base64") },
      { contentType: "image/webp", byteSize: 4, fileBase64: Buffer.from("fake").toString("base64") },
    ]) {
      fixture.call.mockResolvedValueOnce({ data });
      await expect(customerPhotoRepository.load("one", photoId)).rejects.toBeInstanceOf(Error);
    }
  });
  it("reuses optimized file on upload retry and preserves upload id", async () => {
    const file = new File([new Uint8Array([255, 216, 255])], "photo.jpg", { type: "image/jpeg" });
    fixture.call.mockResolvedValue({ data: { uploadId: photoId, width: 100, height: 80 } });
    await customerPhotoRepository.upload(file, photoId); await customerPhotoRepository.upload(file, photoId);
    expect(fixture.optimize).toHaveBeenCalledOnce();
    expect(fixture.call).toHaveBeenLastCalledWith("uploadCustomerPhoto", { uploadId: photoId, contentType: "image/jpeg", fileBase64: "/9j/" });
  });
  it.each(["", "application/octet-stream", "image/jpg"])("normalizes a real JPEG from a mobile album reporting MIME '%s'", async (type) => {
    const file = new File([new Uint8Array([255, 216, 255])], "mobile.jpg", { type });
    expect(validateCustomerPhotoFile(file)).toBeNull();
    fixture.call.mockResolvedValue({ data: { uploadId: photoId, width: 100, height: 80 } });
    await customerPhotoRepository.upload(file, photoId);
    expect(fixture.optimize.mock.calls[0]![0]).toMatchObject({ type: "image/jpeg", name: "mobile.jpg" });
    expect(fixture.call).toHaveBeenCalledWith("uploadCustomerPhoto", { uploadId: photoId, contentType: "image/jpeg", fileBase64: "/9j/" });
  });
  it("rejects a renamed non-image before decoding or sending and identifies unsupported HEIC", async () => {
    const file = new File(["<svg onload='unsafe'/>"], "fake.jpg", { type: "image/jpeg" });
    await expect(customerPhotoRepository.upload(file, photoId)).rejects.toMatchObject({ code: "photo/invalid-source" });
    expect(fixture.optimize).not.toHaveBeenCalled();
    expect(fixture.call).not.toHaveBeenCalled();
    expect(validateCustomerPhotoFile(new File(["heic"], "camera.heic", { type: "" }))).toContain("HEIC");
    // An OS can convert camera bytes to JPEG while retaining the source name.
    expect(validateCustomerPhotoFile(new File([new Uint8Array([255, 216, 255])], "camera.heic", { type: "image/jpeg" }))).toBeNull();
  });
  it("retains a failed source for retry but retries preprocessing instead of caching the rejection", async () => {
    const file = new File([new Uint8Array([255, 216, 255])], "photo.jpg", { type: "image/jpeg" });
    fixture.optimize.mockRejectedValueOnce(new Error("private decoder detail"));
    await expect(customerPhotoRepository.upload(file, photoId)).rejects.toMatchObject({ code: "photo/processing-failed" });
    expect(fixture.call).not.toHaveBeenCalled();
    fixture.call.mockResolvedValue({ data: { uploadId: photoId, width: 100, height: 80 } });
    await customerPhotoRepository.upload(file, photoId);
    expect(fixture.optimize).toHaveBeenCalledTimes(2);
    expect(customerPhotoErrorMessage({ code: "photo/processing-failed", message: "private decoder detail" })).toContain("다시 준비");
    expect(customerPhotoErrorMessage({ code: "functions/deadline-exceeded" })).toContain("저장");
    expect(customerPhotoErrorMessage({ code: "functions/failed-precondition" })).not.toContain("만료");
  });
  it("separates source picker30MB from optimized transmission10MB and never surfaces raw errors", () => {
    expect(validateCustomerPhotoFile({ type: "image/jpeg", size: 15 * 1024 * 1024 } as File)).toBeNull();
    expect(validateCustomerPhotoFile({ type: "image/jpeg", size: 31 * 1024 * 1024 } as File)).toContain("30MB");
    expect(validateCustomerPhotoFile({ type: "image/svg+xml", size: 100 } as File)).toContain("JPEG");
    expect(customerPhotoErrorMessage({ message: "private-fileBase64-secret" })).not.toContain("secret");
  });
});
