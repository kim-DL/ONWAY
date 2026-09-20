import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InventoryEvent } from "@/domain/inventory";

const harness = vi.hoisted(() => ({ states: [] as unknown[], refs: [] as Array<{ current: unknown }>, cursor: 0, refCursor: 0, effects: [] as Array<() => void | (() => void)>, history: vi.fn() }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(),
  useState: (initial: unknown) => { const index = harness.cursor++; if (!(index in harness.states)) harness.states[index] = initial; return [harness.states[index], (next: unknown) => { harness.states[index] = typeof next === "function" ? next(harness.states[index]) : next; }]; },
  useRef: (initial: unknown) => { const index = harness.refCursor++; return harness.refs[index] ?? (harness.refs[index] = { current: initial }); },
  useEffect: (effect: () => void | (() => void)) => harness.effects.push(effect),
}));
vi.mock("./inventory-repository", () => ({ inventoryRepository: { history: harness.history }, inventoryErrorMessage: () => "기록 연결을 다시 확인해주세요." }));
import { InventoryHistory } from "./inventory-history";

type Props = Record<string, unknown> & { children?: ReactNode };
function find(node: ReactNode, predicate: (type: unknown, props: Props) => boolean): Props | null {
  if (Array.isArray(node)) { for (const item of node) { const match = find(item, predicate); if (match) return match; } return null; }
  if (!isValidElement<Props>(node)) return null;
  return predicate(node.type, node.props) ? node.props : find(node.props.children, predicate);
}
function articles(tree: ReactNode): string[] {
  if (Array.isArray(tree)) return tree.flatMap(articles);
  if (!isValidElement<Props>(tree)) return [];
  return tree.type === "article" ? [String(tree.key)] : articles(tree.props.children);
}
function render(productId = "product-1") { harness.cursor = 0; harness.refCursor = 0; harness.effects = []; return InventoryHistory({ productId }); }
function click(tree: ReactNode, label: string) { (find(tree, (_type, props) => props.children === label)!.onClick as () => void)(); }
function run() { return harness.effects[0]!() as () => void; }
async function settle() { for (let index = 0; index < 8; index += 1) await Promise.resolve(); }
const event = (eventId: string, kind: InventoryEvent["kind"] = "receive"): InventoryEvent => ({ eventId, productId: "product-1", kind, locationId: "refrigerated", createdAt: "2026-09-13T01:00:00.000Z", lines: [], reason: "", unitLabel: "봉", unitsPerBox: 12, stockRevision: 1, actorEmployeeId: "employee-1", cycleId: null });
beforeEach(() => { harness.states = []; harness.refs = []; harness.cursor = 0; harness.refCursor = 0; harness.effects = []; harness.history.mockReset(); });

describe("inventory history recovery", () => {
  it("finishes initial loading after failure and retries the initial page explicitly", async () => {
    harness.history.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ events: [event("one")], nextCursor: null });
    render(); run(); await settle();
    let tree = render(); expect(tree.props["aria-busy"]).toBe(false);
    expect(find(tree, (_type, props) => props.role === "alert")).not.toBeNull();
    click(tree, "기록 다시 불러오기"); tree = render(); expect(tree.props["aria-busy"]).toBe(true); run(); await settle();
    tree = render(); expect(tree.props["aria-busy"]).toBe(false); expect(articles(tree)).toEqual(["one"]);
    expect(harness.history.mock.calls).toEqual([["product-1", null], ["product-1", null]]);
  });

  it("retries the same failed older page without losing loaded rows or duplicating records", async () => {
    harness.history.mockResolvedValueOnce({ events: [event("one")], nextCursor: "older" }).mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce({ events: [event("one"), event("two"), event("two")], nextCursor: null });
    render(); run(); await settle(); let tree = render(); click(tree, "이전 기록 더 보기"); render(); run(); await settle();
    tree = render(); expect(tree.props["aria-busy"]).toBe(false); expect(articles(tree)).toEqual(["one"]);
    click(tree, "기록 다시 불러오기"); render(); run(); await settle(); tree = render();
    expect(tree.props["aria-busy"]).toBe(false); expect(articles(tree)).toEqual(["one", "two"]);
    expect(harness.history.mock.calls).toEqual([["product-1", null], ["product-1", "older"], ["product-1", "older"]]);
  });

  it("allows only one queued retry even if the button is tapped twice before rendering", async () => {
    harness.history.mockRejectedValueOnce(new Error("offline")); render(); run(); await settle();
    const tree = render(); click(tree, "기록 다시 불러오기"); click(tree, "기록 다시 불러오기");
    expect(harness.states[0]).toMatchObject({ retry: 1 });
    harness.history.mockResolvedValueOnce({ events: [], nextCursor: null }); render(); run(); await settle();
    expect(harness.history).toHaveBeenCalledTimes(2); expect(render().props["aria-busy"]).toBe(false);
  });

  it("ignores late results after unmount and starts a different product at the first page", async () => {
    let resolve!: (response: { events: InventoryEvent[]; nextCursor: null }) => void;
    harness.history.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    render(); const cleanup = run(); cleanup(); resolve({ events: [event("private-old")], nextCursor: null }); await settle();
    expect(articles(render("product-2"))).toEqual([]);
    harness.history.mockResolvedValueOnce({ events: [event("new")], nextCursor: null }); run(); await settle();
    expect(harness.history.mock.lastCall).toEqual(["product-2", null]); expect(articles(render("product-2"))).toEqual(["new"]);
  });

  it("clears previously read records on authorization failure and retries from the first page", async () => {
    harness.history.mockResolvedValueOnce({ events: [event("one")], nextCursor: "older" }).mockRejectedValueOnce({ code: "functions/permission-denied" });
    render(); run(); await settle(); click(render(), "이전 기록 더 보기"); render(); run(); await settle();
    const tree = render(); expect(articles(tree)).toEqual([]);
    harness.history.mockResolvedValueOnce({ events: [event("authorized")], nextCursor: null }); click(tree, "기록 다시 불러오기"); render(); run(); await settle();
    expect(harness.history.mock.lastCall).toEqual(["product-1", null]); expect(articles(render())).toEqual(["authorized"]);
  });

  it("uses the expiry-information label and reports a genuinely empty result without an error", async () => {
    harness.history.mockResolvedValueOnce({ events: [event("edit", "lot_update")], nextCursor: null });
    render(); run(); await settle(); const tree = render();
    expect(find(tree, (type, props) => type === "strong" && props.children === "유통기한 정보 수정")).not.toBeNull();
    harness.history.mockResolvedValueOnce({ events: [], nextCursor: null }); render("empty-product"); run(); await settle();
    const empty = render("empty-product"); expect(empty.props["aria-busy"]).toBe(false);
    expect(find(empty, (_type, props) => props.children === "아직 기록이 없어요.")).not.toBeNull();
  });
});
