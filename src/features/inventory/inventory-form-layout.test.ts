import { createElement as h, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { inventoryLocationMap, inventoryProductSchema, type InventoryContext, type InventoryLot } from "@/domain/inventory";

vi.mock("client-only", () => ({}));
// Render the sheet contents without its client-only footer portal in this SSR layout test.
vi.mock("@/components/ui/bottom-sheet", async (original) => ({ ...await original<typeof import("@/components/ui/bottom-sheet")>(), BottomSheet: ({ children }: { children: ReactNode }) => h("section", null, children) }));
vi.mock("./inventory-repository", () => ({ inventoryRepository: {}, inventoryErrorMessage: () => "검증용 오류" }));
import { InventoryCountForm, InventoryLotEditor, InventoryMovementForm, InventoryStatusForm } from "./inventory-forms";
import { InventoryProductEditorImpl as InventoryProductEditor } from "./inventory-product-editor";

const product = inventoryProductSchema.parse({ productId: "product-1", companyId: "onnuri", name: "검증용 만두", manufacturer: "", specification: "", origin: "", unitLabel: "봉", unitsPerBox: 12, defaultLocationId: "refrigerated", note: "", urgent: false, status: "active", revision: 3, stockRevision: 1, hasHistory: true, quantityByLocation: { ...inventoryLocationMap(0), refrigerated: 29 }, nearestExpiryByLocation: inventoryLocationMap(null), lastCountByLocation: inventoryLocationMap(null), photo: null, createdAt: "2026-09-10T01:00:00.000Z", updatedAt: "2026-09-10T01:00:00.000Z", createdBy: "employee-1", updatedBy: "employee-1" });
const lot: InventoryLot = { lotId: "lot-1", productId: product.productId, originLotId: "lot-1", locationId: "refrigerated", label: "별도 구분용 이름", expiryState: "dated", expiryDate: "2026-12-01", quantity: 29, revision: 1, createdAt: product.createdAt, updatedAt: product.updatedAt };
const context: InventoryContext = { canWrite: true, canAdmin: false, today: "2026-09-13", cycle: { cycleId: "week-2026-09-11", weekday: 5, startDate: "2026-09-11", nextDate: "2026-09-18" }, settings: { urgentDays: 100, weekday: 5, revision: 0, pendingWeekday: null, effectiveDate: null, updatedAt: null, updatedBy: null } };
const noop = () => undefined;
describe("compact date-first inventory forms", () => {
  it("omits a mandatory reason for expiry edits and keeps quantity/history preservation explicit for status actions", () => {
    const edit = renderToStaticMarkup(h(InventoryLotEditor, { detail: { product, lots: [lot] }, lot, onClose: noop, onSaved: noop }));
    expect(edit).not.toContain("수정 사유");
    expect(edit).toContain("유통기한 날짜 달력 열기");
    const remove = renderToStaticMarkup(h(InventoryStatusForm, { product, remove: true, onClose: noop, onSaved: noop }));
    expect(remove).toContain("재고 수량과 입출고·실사 기록은 보관");
    expect(remove).toContain("처리한 직원이 이력");
    expect(remove).not.toContain("이력이 없는");
    const inactive = renderToStaticMarkup(h(InventoryStatusForm, { product, remove: false, onClose: noop, onSaved: noop }));
    expect(inactive).not.toContain("0일 때");
    expect(inactive).toContain("다시 활성화할 수 있어요");
  });
  it("keeps photo, product fields, optional note and initial stock on one form with a directly editable date", () => {
    const html = renderToStaticMarkup(h(InventoryProductEditor, { product: null, location: "refrigerated", onClose: noop, onSaved: noop }));
    expect(html.match(/<form /g)).toHaveLength(1);
    expect(html.indexOf("제품 사진")).toBeLessThan(html.indexOf("품목명"));
    expect(html.indexOf("기본 보관 장소")).toBeLessThan(html.indexOf("제조사"));
    expect(html.indexOf("제조사")).toBeLessThan(html.indexOf("초기 수량 (필수)"));
    expect(html).toContain('placeholder="YYYY-MM-DD"');
    expect(html).toContain('aria-label="첫 유통기한 날짜 달력 열기"');
    expect(html.indexOf("원산지")).toBeLessThan(html.indexOf("규격"));
    expect(html.indexOf("첫 유통기한 날짜")).toBeLessThan(html.indexOf("초기 수량 (필수)"));
    expect(html).toMatch(/type="radio"[^>]*checked=""[^>]*value="dated"/);
    expect(html.match(/type="radio"/g)).toHaveLength(11);
    expect(html).toContain("낱개");
    expect(html).not.toMatch(/>개</);
    expect(html.indexOf("유통기한 상태")).toBeLessThan(html.indexOf("첫 유통기한 날짜"));
    expect(html).not.toContain("해당 없음");
    expect(html).toMatch(/<details><summary[^>]*>참고 메모 \(선택\)/);
    expect(html).not.toContain("수량은 품목 등록 후");
    expect(html).not.toContain("입고 묶음");
    expect(html).not.toContain("박스");
    expect(html).toContain('aria-label="초기 수량 (필수) (낱개)"');
    expect(html).toContain("규격 · 선택");
    expect(html).not.toContain("원산지 직접입력<input");
    expect(html).not.toContain("규격 직접입력<input");
    expect(html).not.toContain("기준 단위 직접입력");
  });

  it.each(["issue", "adjust", "transfer"] as const)("omits an unnecessary expiry selector for a single-stock %s", (kind) => {
    const html = renderToStaticMarkup(h(InventoryMovementForm, { detail: { product, lots: [lot] }, location: "refrigerated", kind, onClose: noop, onSaved: noop }));
    expect(html).not.toContain("유통기한 선택<select");
    expect(html).toContain("2026.12.01</strong>");
    expect(html).toContain("현재 29 봉");
    expect(html).toContain("<details><summary>추가 구분명</summary>");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("조정 사유");
    expect(html).toContain('placeholder="예: 10"');
    expect(html).not.toContain("1,000,000,000");
  });

  it("lists multiple expiry dates earliest-first and puts quantity before the optional label", () => {
    const second = { ...lot, lotId: "lot-2", expiryDate: "2026-11-01", quantity: 7 };
    const html = renderToStaticMarkup(h(InventoryMovementForm, { detail: { product, lots: [lot, second] }, location: "refrigerated", kind: "issue", onClose: noop, onSaved: noop }));
    expect(html).toContain("유통기한 선택<select");
    expect(html).toContain("2026.11.01 · 7 봉 · 별도 구분용 이름");
    expect(html.indexOf("2026.11.01")).toBeLessThan(html.indexOf("2026.12.01"));
  });

  it("shows matching quantities as read-only rows without editing or memo fields", () => {
    const html = renderToStaticMarkup(h(InventoryCountForm, { detail: { product, lots: [lot] }, location: "refrigerated", context, countMode: true, onClose: noop, onSaved: noop }));
    expect(html).toContain("재고 수량과 실제 수량이 일치하나요?");
    expect(html).toContain("2026.12.01");
    expect(html).toContain("29 <small>봉</small>");
    expect(html).not.toMatch(/장부 합계|실측 합계|차이|박스|<input|<textarea|메모/);
    expect(html).toContain(">일치 확인</button>");
  });

  it("keeps legacy expiry metadata explicit without offering a not-applicable radio", () => {
    const html = renderToStaticMarkup(h(InventoryLotEditor, { detail: { product, lots: [lot] }, lot: { ...lot, expiryState: "not_applicable", expiryDate: null }, onClose: noop, onSaved: noop }));
    expect(html).toContain("기존 ‘해당 없음’ 기록을 유지");
    expect(html.match(/type="radio"/g)).toHaveLength(2);
    expect(html).not.toContain('value="not_applicable"');
    expect(html).not.toContain('checked=""');
  });

  it("places exact-lot actions in a compact separate footer row", () => {
    const html = renderToStaticMarkup(h(InventoryLotEditor, { detail: { product, lots: [lot] }, lot, onClose: noop, onSaved: noop, onMovement: noop }));
    expect(html).toContain('aria-label="이 유통기한 재고 관리"');
    expect(html).toContain(">출고</button>"); expect(html).toContain(">입고</button>"); expect(html).toContain(">조정</button>");
    expect(html.indexOf("유통기한 상태")).toBeLessThan(html.indexOf("유통기한 날짜"));
    expect(html.indexOf("이 유통기한 재고 관리")).toBeLessThan(html.indexOf(">취소</button>"));
  });
});
