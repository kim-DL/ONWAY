import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { DeliveryPhotoMetadata } from "@/domain/delivery-photo";
import { deliveryPhotoCardLabel, newestDeliveryPhotos } from "./delivery-photo-history-model";

const base = { customerId: "customer-a", deliveryDateKey: "2026-09-24", source: "camera",
  createdByEmployeeId: "employee_1", createdByName: "홍길동", expiresAt: "2026-10-01T01:42:00.000Z",
  thumbnail: { width: 640, height: 480 } } as const;
const photos: DeliveryPhotoMetadata[] = [
  { ...base, photoId: "eb12d3e0-35f3-400e-9165-32938939afc8", createdAt: "2026-09-24T01:40:00.000Z" },
  { ...base, photoId: "f71f8dbf-eb20-4919-8d55-0f41b6f08d9b", createdAt: "2026-09-24T01:42:00.000Z" },
];

describe("delivery photo recent history and viewer", () => {
  it("orders metadata newest-first and labels the person as 등록자", () => {
    expect(newestDeliveryPhotos(photos).map((photo) => photo.photoId)).toEqual([photos[1]!.photoId, photos[0]!.photoId]);
    expect(deliveryPhotoCardLabel("한빛유통", photos[1]!)).toMatch(/^한빛유통 납품사진, .*등록자 홍길동$/u);
    expect(deliveryPhotoCardLabel("한빛유통", photos[1]!)).not.toContain("촬영자");
  });

  it("keeps thumbnail fetches viewport-gated and evidence fetches viewer-only", () => {
    const thumbnail = readFileSync(fileURLToPath(new URL("./delivery-photo-thumbnail.tsx", import.meta.url)), "utf8");
    const viewer = readFileSync(fileURLToPath(new URL("./delivery-photo-viewer.tsx", import.meta.url)), "utf8");
    expect(thumbnail).toContain("IntersectionObserver");
    expect(thumbnail).toContain('rootMargin: "160px 0px"');
    expect(thumbnail).toContain('photo.photoId, "thumbnail"');
    expect(viewer).toContain('photo?.photoId ?? "", "evidence"');
    expect(thumbnail).not.toContain("evidence");
  });

  it("retains keyboard, Back/Escape foundation, position announcements and explicit controls", () => {
    const history = readFileSync(fileURLToPath(new URL("./delivery-photo-history.tsx", import.meta.url)), "utf8");
    const viewer = readFileSync(fileURLToPath(new URL("./delivery-photo-viewer.tsx", import.meta.url)), "utf8");
    expect(history).toContain("최근 기록");
    expect(viewer).toContain('event.key === "ArrowLeft"');
    expect(viewer).toContain('event.key === "ArrowRight"');
    expect(viewer).toContain('aria-live="polite"');
    expect(viewer).toContain("<BottomSheet");
    expect(viewer).toContain("이전"); expect(viewer).toContain("다음"); expect(viewer).toContain("닫기");
  });

  it("uses a responsive two-to-one-column grid and 44px controls without persistent photo state", () => {
    const historyCss = readFileSync(fileURLToPath(new URL("./delivery-photo-history.module.css", import.meta.url)), "utf8");
    const sources = ["delivery-photo-history.tsx", "delivery-photo-thumbnail.tsx", "delivery-photo-viewer.tsx", "use-delivery-photo-image.ts"]
      .map((file) => readFileSync(fileURLToPath(new URL(`./${file}`, import.meta.url)), "utf8")).join("\n");
    expect(historyCss).toContain("grid-template-columns:repeat(auto-fit,minmax(min(9rem,100%),1fr))");
    expect(historyCss).toContain("min-height:44px");
    expect(sources).not.toMatch(/localStorage|sessionStorage|indexedDB|CacheStorage|serviceWorker|deleteDeliveryPhoto|navigator\.share/u);
  });
});
