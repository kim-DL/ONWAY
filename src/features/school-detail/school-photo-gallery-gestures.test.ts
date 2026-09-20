import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const source = ts.createSourceFile("school-photo-gallery.tsx", readFileSync(new URL("./school-photo-gallery.tsx", import.meta.url), "utf8"), ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
const css = readFileSync(new URL("./school-photo-viewer.module.css", import.meta.url), "utf8");
function productionHandlers() {
  const declarations: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && ["pointerDown", "pointerMove", "pointerUp"].includes(node.name.text)) declarations.push(`const ${node.getText(source)};`);
    ts.forEachChild(node, visit);
  };
  visit(source);
  class Target { closest() { return null; } }
  const state = {
    scale: 1, pointers: { current: new Map<number, { x: number; y: number }>() },
    gestureStart: { current: null as { x: number; y: number; distance: number | null; pinching: boolean } | null },
    photos: [{}, {}], navigate: vi.fn(), requestClose: vi.fn(), setScale: vi.fn(), Element: Target,
  };
  const sandbox = createContext(state);
  const compiled = ts.transpileModule(`${declarations.join("\n")}globalThis.handlers = { pointerDown, pointerMove, pointerUp };`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  runInContext(compiled, sandbox);
  const handlers = sandbox.handlers as Record<"pointerDown" | "pointerMove" | "pointerUp", (event: unknown) => void>;
  const capture = vi.fn();
  const event = (pointerId: number, x: number, y: number) => ({ pointerId, clientX: x, clientY: y, target: new Target(), currentTarget: { setPointerCapture: capture } });
  return { state, handlers, event, capture };
}

describe("school photo touch ownership", () => {
  it("reserves fitted-image gestures and hands a zoomed image to native panning", () => {
    expect(css).toMatch(/\.schoolStage\s*\{[^}]*touch-action:\s*none/);
    expect(css).toMatch(/\.schoolStage\[data-zoomed="true"\]\s*\{[^}]*touch-action:\s*pan-x pan-y pinch-zoom/);
    const { state, handlers, event, capture } = productionHandlers();
    state.scale = 2.5;
    handlers.pointerDown(event(1, 100, 100));
    handlers.pointerMove(event(1, 180, 100));
    handlers.pointerUp(event(1, 180, 100));
    expect(capture).not.toHaveBeenCalled();
    expect(state.navigate).not.toHaveBeenCalled();
    expect(state.requestClose).not.toHaveBeenCalled();
  });
  it.each([{ end: [10, 100], direction: 1 }, { end: [200, 100], direction: -1 }])("retains a one-finger horizontal swipe %j", ({ end, direction }) => {
    const { state, handlers, event } = productionHandlers();
    handlers.pointerDown(event(1, 100, 100));
    handlers.pointerUp(event(1, end[0]!, end[1]!));
    expect(state.navigate).toHaveBeenCalledWith(direction);
    expect(state.requestClose).not.toHaveBeenCalled();
  });
  it("retains downward swipe dismissal", () => {
    const { state, handlers, event } = productionHandlers();
    handlers.pointerDown(event(1, 100, 100));
    handlers.pointerUp(event(1, 105, 240));
    expect(state.requestClose).toHaveBeenCalledOnce();
    expect(state.navigate).not.toHaveBeenCalled();
  });
  it("does not mistake either finger of a pinch for swipe navigation or dismissal", () => {
    const { state, handlers, event } = productionHandlers();
    handlers.pointerDown(event(1, 100, 100));
    handlers.pointerDown(event(2, 200, 100));
    handlers.pointerMove(event(2, 300, 100));
    expect(state.setScale).toHaveBeenCalledWith(2);
    handlers.pointerUp(event(2, 300, 100));
    handlers.pointerUp(event(1, 100, 250));
    expect(state.navigate).not.toHaveBeenCalled();
    expect(state.requestClose).not.toHaveBeenCalled();
    expect(state.gestureStart.current).toBeNull();
  });
});

type GalleryElement = { type: string; props: Record<string, unknown>; children: unknown[] };
function renderGallery(canEdit: boolean, caption = "학교 · 접근") {
  const declaration = source.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "SchoolPhotoGallery")!;
  const setters: Array<ReturnType<typeof vi.fn>> = [];
  const context = createContext({
    createElement: (type: string, props: Record<string, unknown> | null, ...children: unknown[]) => ({ type, props: props ?? {}, children }),
    useState: (value: unknown) => { const set = vi.fn(); setters.push(set); return [value, set]; },
    useMemo: (calculate: () => unknown) => calculate(), useCallback: (callback: unknown) => callback,
    useToast: () => ({ showToast: vi.fn() }),
    PHOTO_SLOT_IDS: ["01", "02", "03"], SLOT_LABELS: { "01": "학교 · 접근", "02": "급식실 출입구", "03": "검수 · 하역 위치" },
    galleryStyles: new Proxy({}, { get: (_, name) => String(name) }),
    Icon: "Icon", PhotoImage: "PhotoImage", BottomSheet: "BottomSheet", PhotoUploader: "PhotoUploader", PhotoViewer: "PhotoViewer", React: { Fragment: "Fragment" },
    exports: {},
  });
  const code = ts.transpileModule(`${declaration.getText(source)}\nglobalThis.renderGallery = SchoolPhotoGallery;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, jsxFactory: "createElement", module: ts.ModuleKind.CommonJS },
  }).outputText;
  runInContext(code, context);
  const render = context.renderGallery as (props: Record<string, unknown>) => GalleryElement;
  const tree = render({ schoolId: "SCH-GALLERY", photos: [{ status: "active", slotId: "01", currentVersionId: "v1", caption }], sessionNamespace: "session", canEdit, onRefresh: vi.fn() });
  const flatten = (node: unknown): GalleryElement[] => {
    if (Array.isArray(node)) return node.flatMap(flatten);
    if (!node || typeof node !== "object" || !("children" in node)) return [];
    const element = node as GalleryElement;
    return [element, ...element.children.flatMap(flatten)];
  };
  const text = (node: unknown): string => typeof node === "string" ? node : Array.isArray(node) ? node.map(text).join("")
    : node && typeof node === "object" && "children" in node ? (node as GalleryElement).children.map(text).join("") : "";
  return { tree, elements: flatten(tree), text: text(tree), setters };
}

describe("school photo gallery presentation", () => {
  it("keeps photo actions outside the image and removes decorative status/duplicate captions", () => {
    const view = renderGallery(true);
    expect(view.text).not.toMatch(/슬롯 비어 있음|사진 준비 완료|아직 등록되지 않았어요/);
    expect(view.text.match(/학교 · 접근/g)).toHaveLength(1);
    const card = view.elements.find((element) => element.type === "article")!;
    expect((card.children[0] as GalleryElement).type).toBe("PhotoImage");
    expect((card.children[1] as GalleryElement).props.className).toBe("footer");
    const footer = card.children[1] as GalleryElement;
    expect((footer.children[1] as GalleryElement).props.className).toContain("photo-card__actions");
  });
  it("preserves staff-written context below the photo without exposing edit actions to viewers", () => {
    const view = renderGallery(false, "정문 오른쪽 파란 출입문");
    expect(view.text).toContain("정문 오른쪽 파란 출입문");
    const buttons = view.elements.filter((element) => element.type === "button");
    expect(buttons.some((element) => /교체|삭제/.test(String(element.props["aria-label"])))).toBe(false);
    expect(buttons.filter((element) => element.props.disabled === true)).toHaveLength(2);
  });
  it("uses the actual image bounds rather than the new external button as the morph origin", () => {
    const view = renderGallery(true);
    const button = view.elements.find((element) => element.type === "button" && element.props["aria-label"] === "학교 · 접근 크게 보기")!;
    const origin = { id: "actual-image-bounds" };
    const querySelector = vi.fn(() => origin);
    (button.props.onClick as (event: unknown) => void)({ currentTarget: { closest: () => ({ querySelector }) } });
    expect(querySelector).toHaveBeenCalledWith("[data-school-photo-origin]");
    expect(view.setters[2]).toHaveBeenCalledWith(origin);
    expect(view.setters[1]).toHaveBeenCalledWith(0);
  });
});
