import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("client-only", () => ({}));
vi.mock("./inventory-repository", () => ({ inventoryRepository: {}, inventoryErrorMessage: () => "사진 오류" }));
import { inventoryPhotoBase64 } from "./inventory-photo";

type Mode = "read" | "error" | "abort" | "invalid";
function reader(mode: Mode) {
  vi.stubGlobal("FileReader", class {
    result: string | ArrayBuffer | null = null;
    error = new DOMException("Unreadable file", "NotReadableError");
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    readAsDataURL(file: File) {
      void file.arrayBuffer().then((bytes) => {
        if (mode === "error") { this.onerror?.(); return; }
        if (mode === "abort") { this.onabort?.(); return; }
        this.result = mode === "invalid" ? bytes : `data:${file.type};base64,${Buffer.from(bytes).toString("base64")}`;
        this.onload?.();
      });
    }
  });
}
afterEach(() => vi.unstubAllGlobals());
describe("inventory photo FileReader encoding", () => {
  it.each([1, 2, 3, 8191, 8192, 8193, 262144])("preserves bytes and padding for %i source bytes", async (size) => {
    reader("read");
    const bytes = Buffer.from(Array.from({ length: size }, (_, index) => index % 256));
    expect(await inventoryPhotoBase64(new File([bytes], "photo.webp", { type: "image/webp" }))).toBe(bytes.toString("base64"));
  });
  it.each(["error", "abort", "invalid"] as const)("rejects a %s reader result", async (mode) => {
    reader(mode);
    const pending = inventoryPhotoBase64(new File(["photo"], "photo.webp", { type: "image/webp" }));
    if (mode === "abort") await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    else if (mode === "error") await expect(pending).rejects.toMatchObject({ name: "NotReadableError" });
    else await expect(pending).rejects.toThrow("Invalid inventory photo");
  });
});
