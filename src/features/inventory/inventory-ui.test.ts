import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { inventoryLocationMap, inventoryProductSchema, type InventoryContext, type InventoryLot } from "@/domain/inventory";

vi.mock("client-only", () => ({}));
vi.mock("@/features/auth/auth-context", () => ({ useAuth: () => ({ state: { status: "unauthenticated" } }) }));
vi.mock("./inventory-repository", () => ({ inventoryRepository: {}, inventoryErrorMessage: () => "검증용 오류" }));
import { InventoryCard } from "./inventory-card";
import { InventoryCountForm, InventoryMovementForm, InventorySettingsForm } from "./inventory-forms";
import { InventoryProductEditorImpl as InventoryProductEditor } from "./inventory-product-editor";
import { ShellHeader } from "@/features/app-shell/app-shell-header";
import { Icon } from "@/components/ui/icon";
import styles from "./inventory.module.css";
import headerStyles from "@/features/app-shell/app-shell-header.module.css";
import brandStyles from "@/features/app-shell/app-brand.module.css";

const product = inventoryProductSchema.parse({ productId: "product-1", companyId: "onnuri", name: "국내산 닭가슴살", manufacturer: "온누리식품", specification: "1kg · 개별 포장", origin: "국내산", unitLabel: "봉", unitsPerBox: 12, defaultLocationId: "refrigerated", note: "검증용 가상 데이터", urgent: false, status: "active", revision: 2, stockRevision: 3, hasHistory: true, quantityByLocation: { ...inventoryLocationMap(0), refrigerated: 29 }, nearestExpiryByLocation: { ...inventoryLocationMap(null), refrigerated: "2026-09-13" }, lastCountByLocation: inventoryLocationMap(null), photo: null, createdAt: "2026-09-10T01:00:00.000Z", updatedAt: "2026-09-10T01:00:00.000Z", createdBy: "employee-1", updatedBy: "employee-1" });
const context: InventoryContext = { today: "2026-09-10", canWrite: true, canAdmin: true, cycle: { cycleId: "week-2026-09-07", startDate: "2026-09-07", nextDate: "2026-09-14", weekday: 1 }, settings: { weekday: 1, urgentDays: 7, revision: 0, pendingWeekday: null, effectiveDate: null, pendingCycleStartDate: null, updatedAt: null, updatedBy: null } };
const lot: InventoryLot = { lotId: "lot-1", productId: product.productId, locationId: "refrigerated", originLotId: "lot-1", quantity: 29, revision: 1, label: "9월 입고", expiryState: "dated", expiryDate: "2026-09-13", createdAt: product.createdAt, updatedAt: product.updatedAt };
const noop = () => undefined;
describe("inventory UI contracts", () => {
  it("keeps the floating action reachable and reserves room to scroll the final card above it", () => {
    const css = readFileSync(new URL("./inventory.module.css", import.meta.url), "utf8");
    expect(css).toContain(".workspace[data-write-actions] { padding-bottom: calc(var(--inventory-action-inset) + 64px + env(safe-area-inset-bottom)); }");
    expect(css).toMatch(/\.workspace\s*\{[^}]*align-content:\s*start/);
    expect(css).toMatch(/\.stickyActions\s*\{[^}]*position: fixed;[^}]*bottom: calc\(var\(--inventory-action-inset\)/);
    expect(css).toContain(".workspace[data-admin] { --inventory-action-inset: 100px; }");
    expect(css).toContain("@media (min-width: 761px) { .workspace, .workspace[data-admin] { --inventory-action-inset: 16px; } }");
  });
  it("uses one accessible native card button, quantity units and expiry/count badges without image downloads", () => {
    const html = renderToStaticMarkup(h(InventoryCard, { product, location: "refrigerated", context, onOpen: noop }));
    expect(html).toContain('aria-label="국내산 닭가슴살, 29 봉, 상세 보기"');
    expect(html).not.toContain("박스"); expect(html).toContain("D-3"); expect(html).toContain("2026.09.13"); expect(html).toContain("냉장 · 온누리식품 · 봉"); expect(html).not.toContain("미확인");
    expect(html.match(/<button/g)).toHaveLength(1); expect(html).not.toContain("<img");
    expect(html).not.toContain("입고 기록"); expect(html).not.toContain("품목 삭제");
  });
  it("renders a stored 개 unit as 낱개 in inventory UI", () => {
    const each = { ...product, unitLabel: "개" };
    const html = renderToStaticMarkup(h(InventoryCard, { product: each, location: "refrigerated", context, onOpen: noop }));
    expect(html).toContain('aria-label="국내산 닭가슴살, 29 낱개, 상세 보기"');
    expect(html).toContain("냉장 · 온누리식품 · 낱개");
    expect(html).not.toMatch(/>개</);
  });
  it("shows the expiry date without a D badge outside the urgent window, including all-location cards", () => {
    const html = renderToStaticMarkup(h(InventoryCard, { product: { ...product, nearestExpiryByLocation: { ...product.nearestExpiryByLocation, refrigerated: "2027-09-13" } }, location: "all", context, onOpen: noop }));
    expect(html).toContain("유통기한 2027.09.13"); expect(html).not.toContain("D-"); expect(html).not.toContain("박스");
  });
  it("shows read-only quantities for every positive lot and explicitly confirms zero counts", () => {
    const html = renderToStaticMarkup(h(InventoryCountForm, { detail: { product, lots: [lot] }, location: "refrigerated", context, countMode: true, onClose: noop, onSaved: noop }));
    expect(html).toContain("재고 수량과 실제 수량이 일치하나요?"); expect(html).toContain("29 <small>봉</small>");
    expect(html).not.toContain('<input'); expect(html).not.toContain('<textarea');
    const zero = renderToStaticMarkup(h(InventoryCountForm, { detail: { product: { ...product, quantityByLocation: inventoryLocationMap(0) }, lots: [] }, location: "refrigerated", context, countMode: true, onClose: noop, onSaved: noop }));
    expect(zero).toContain("0 <small>봉</small>"); expect(zero).toContain("실제 재고도 없는지 확인해주세요");
  });
  it("exposes the date and count badges as the card description, while inactive products remain neutral", () => {
    const dayContext = { ...context, today: context.cycle.startDate };
    const html = renderToStaticMarkup(h(InventoryCard, { product: { ...product, createdAt: "2026-09-06T01:00:00.000Z" }, location: "refrigerated", context: dayContext, onOpen: noop }));
    const descriptionId = html.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(descriptionId).toBeTruthy(); expect(html).toContain(`id="${descriptionId}"`);
    expect(html).toContain('data-count-highlight="pending"');
    const inactive = renderToStaticMarkup(h(InventoryCard, { product: { ...product, status: "inactive", quantityByLocation: inventoryLocationMap(0) }, location: "refrigerated", context: dayContext, onOpen: noop }));
    expect(inactive).toContain('data-count-highlight="neutral"'); expect(inactive).toContain("비활성 품목");
    expect(inactive).not.toContain("미확인"); expect(inactive).not.toContain('data-count-state=');
  });
  it("labels adjustments as final quantities without a memo or reason input", () => {
    const html = renderToStaticMarkup(h(InventoryMovementForm, { detail: { product, lots: [lot] }, location: "refrigerated", kind: "adjust", onClose: noop, onSaved: noop }));
    expect(html).toContain("조정 후 최종 수량"); expect(html).toContain("현재 29 봉");
    expect(html).not.toContain("<textarea"); expect(html).not.toContain("조정 사유");
  });
  it("requires an explicit destination for transfers and excludes the source location", () => {
    const html = renderToStaticMarkup(h(InventoryMovementForm, { detail: { product, lots: [lot] }, location: "refrigerated", kind: "transfer", onClose: noop, onSaved: noop }));
    expect(html).toContain("보관 장소 이동"); expect(html).toContain("이동 수량");
    expect(html).toContain("전체 재고 수량은 바뀌지 않아요");
    const destination = html.match(/도착 보관 장소<select([\s\S]*?)<\/select>/)?.[1] ?? "";
    expect(destination).toContain('required=""'); expect(destination).toContain('value="freezer1"');
    expect(destination).toContain('value="freezer2"'); expect(destination).toContain('value="sample"');
    expect(destination).not.toContain('value="refrigerated"');
  });
  it("warns instead of silently accepting a count while the date context is unverified", () => {
    const html = renderToStaticMarkup(h(InventoryCountForm, { detail: { product, lots: [lot] }, location: "refrigerated", context, countMode: true, calendarReady: false, onClose: noop, onSaved: noop }));
    expect(html).toContain("날짜 기준을 다시 확인하고 있어요");
    expect(html).toContain('role="alert"');
  });
  it("offers camera capture only and locks historical unit definitions", () => {
    const html = renderToStaticMarkup(h(InventoryProductEditor, { product, location: "refrigerated", onClose: noop, onSaved: noop }));
    expect(html).toContain('capture="environment"'); expect(html.match(/type="file"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="제품 사진 직접 촬영"');
    expect(html).toContain("사진 촬영");
    expect(html).not.toContain("앨범에서 선택");
    expect(html).not.toContain("파일에서 선택");
    expect(html).toContain("기준 단위를 바꿀 수 없어요");
    expect(html).not.toContain("박스");
    expect(html).not.toContain("임박 품목으로 직접 지정");
  });
  it("explains delayed weekday changes", () => {
    const settings = renderToStaticMarkup(h(InventorySettingsForm, { context, onClose: noop, onSaved: noop }));
    expect(settings).toContain("현재 실사 기간이 끝난 뒤 적용");
  });
  it("exports a synthetic layout fixture using the real scoped header and compact cards", () => {
    function scoped(relative: string, names: Record<string, string>) {
      return readFileSync(new URL(relative, import.meta.url), "utf8").replace(/:global\(([^)]+)\)/g, "$1").replace(/\.([a-zA-Z][\w-]*)/g, (match, name: string) => names[name] ? `.${names[name]}` : match);
    }
    const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8") + scoped("./inventory.module.css", styles) + scoped("../app-shell/app-shell-header.module.css", headerStyles) + scoped("../app-shell/app-brand.module.css", brandStyles);
    const fixtureCards = Array.from({ length: 4 }, (_, index) => h(InventoryCard, {
      key: index, product: { ...product, productId: `fixture-${index}`, name: index ? `${product.name} ${index + 1}` : product.name }, location: "all", context, onOpen: noop,
    }));
    const fixtureLocations = h("div", { className: styles.locations, "data-catalog": true },
      ...["전체", "냉장", "냉동1", "냉동2", "샘플"].map((label, index) => h("button", { key: label, "aria-pressed": index === 0 }, label)));
    const fixtureSearch = h("div", { className: styles.filters },
      h("label", { className: styles.search }, h(Icon, { name: "search", size: 18 }), h("input", { "aria-label": "품목 검색", placeholder: "상품명 · 제조사" })),
      h("button", { className: styles.optionsTrigger, "aria-label": "목록 옵션", "data-active": true }, h(Icon, { name: "sliders", size: 20 }), h("span", { "aria-hidden": true })));
    const markup = renderToStaticMarkup(h("main", { className: "workspace-shell", "data-mode": "inventory" },
      h(ShellHeader, { mode: "inventory", availableModes: ["customer", "delivery", "sales", "inventory"], onModeChange: noop }),
      h("div", { className: "workspace-content" }, h("section", { className: `shell-page ${styles.workspace}` },
        fixtureLocations, fixtureSearch, h("p", { className: styles.countModeStatus }, h("span", { "aria-hidden": true }), "재고조사 ON"), h("div", { className: styles.list }, ...fixtureCards)))));
    const directory = new URL("../../../output/playwright/inventory-layout/", import.meta.url); mkdirSync(directory, { recursive: true });
    writeFileSync(new URL("catalog.html", directory), `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${markup}</body></html>`);
    expect(css).not.toContain(":global(");
  });
});
