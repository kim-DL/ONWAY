import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("client-only", () => ({}));
vi.mock("./inventory-repository", () => ({ inventoryRepository: { photo: vi.fn() }, inventoryErrorMessage: () => "사진 오류" }));
import { InventoryPhotoPicker, inventoryPhotoPreparationMessage } from "./inventory-photo";

describe("inventory camera-only photo entry", () => {
  it("exposes one rear-camera input without album or file-selection alternatives", () => {
    const html = renderToStaticMarkup(createElement(InventoryPhotoPicker, { product: null, file: null, removed: false, disabled: false, onChange: vi.fn(), onBusyChange: vi.fn() }));
    expect(html.match(/type="file"/g)).toHaveLength(1);
    expect(html).toContain('accept="image/*"'); expect(html).toContain('capture="environment"');
    expect(html).toContain('aria-label="제품 사진 직접 촬영"'); expect(html).toContain('aria-label="직접 촬영"');
    expect(html).toContain("사진 촬영"); expect(html).not.toMatch(/앨범|파일에서 선택/);
  });
  it("keeps camera acquisition disabled during an unrelated save", () => {
    const html = renderToStaticMarkup(createElement(InventoryPhotoPicker, { product: null, file: null, removed: false, disabled: true, onChange: vi.fn(), onBusyChange: vi.fn() }));
    expect(html).toMatch(/<input[^>]*capture="environment"[^>]*disabled=""/);
    expect(html).toMatch(/<button[^>]*aria-label="직접 촬영"[^>]*disabled=""/);
  });
  it.each(["photo/source-unreadable", "photo/source-timeout", "photo/processing-failed", "photo/heic-source", "unknown"])("recovers %s through retaking, never a removed picker", (code) => {
    const message = inventoryPhotoPreparationMessage({ code });
    expect(message).toContain("다시 촬영"); expect(message).not.toMatch(/앨범|파일에서 선택/);
  });
});
