import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { customHistoryState } from "@/lib/browser-history";

interface SheetEntry {
  id: string;
  active: boolean;
  ownsEntry: boolean;
  generation: number;
  ancestorIds: string[];
  state: Record<string, unknown>;
}

interface HistoryApi {
  acquireSheetHistory: (entry: SheetEntry) => void;
  activateSheetHistory: (entry: SheetEntry) => number;
  consumeReleasedSheetHistory: () => void;
  traverseSheetHistory: (entry: SheetEntry) => void;
  pending: () => Promise<void> | null;
  entries: Map<string, SheetEntry>;
  closeCallback: (entry: SheetEntry, onClose: () => void) => (event: HistoryEvent) => void;
}

type HistoryState = Record<string, unknown>;
type HistoryEvent = { state: HistoryState };

// Run the production helpers in an isolated browser-history model. The project
// has no DOM unit renderer, and exporting test-only APIs would alter the client
// module. AST selection keeps this tied to named declarations, not line ranges
// or copied helper implementations. Full modal behavior also has browser tests.
const sourceFile = ts.createSourceFile(
  "bottom-sheet.tsx",
  readFileSync(new URL("./bottom-sheet.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.ES2022,
  true,
  ts.ScriptKind.TSX,
);
const requiredDeclarations = new Set([
  "SheetHistoryEntry", "sheetHistoryEntries", "pendingSheetHistoryBack",
  "currentSheetHistoryEntry", "acquireSheetHistory", "traverseSheetHistory",
  "consumeReleasedSheetHistory", "activateSheetHistory",
]);
const foundDeclarations = new Set<string>();
const historyDeclarations = sourceFile.statements.filter((statement) => {
  const names = ts.isVariableStatement(statement)
    ? statement.declarationList.declarations.flatMap((declaration) => ts.isIdentifier(declaration.name) ? [declaration.name.text] : [])
    : (ts.isFunctionDeclaration(statement) || ts.isInterfaceDeclaration(statement)) && statement.name
      ? [statement.name.text]
      : [];
  if (!names.some((name) => requiredDeclarations.has(name))) return false;
  for (const name of names) foundDeclarations.add(name);
  return true;
});
for (const name of requiredDeclarations) {
  if (!foundDeclarations.has(name)) throw new Error(`History regression harness must be updated: missing ${name}`);
}
const printer = ts.createPrinter();
const compiledHistory = ts.transpileModule(
  historyDeclarations.map((statement) => printer.printNode(ts.EmitHint.Unspecified, statement, sourceFile)).join("\n"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

let closeDeclaration: ts.VariableDeclaration | undefined;
const findCloseDeclaration = (node: ts.Node) => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "closeFromHistory") closeDeclaration = node;
  ts.forEachChild(node, findCloseDeclaration);
};
findCloseDeclaration(sourceFile);
if (!closeDeclaration) throw new Error("Missing production closeFromHistory callback");
const compiledCloseCallback = ts.transpileModule(`function closeCallback(entry, onClose) {
  const historyId = entry.id;
  const isCurrent = () => entry.active;
  const closingRef = { current: false }, dismissibleRef = { current: true }, busyActionsRef = { current: new Set() };
  const beforeCloseRef = { current: undefined }, onCloseRef = { current: onClose };
  const ${closeDeclaration.getText(sourceFile)};
  return closeFromHistory;
}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function entry(id: string): SheetEntry {
  return { id, active: true, ownsEntry: false, generation: 1, ancestorIds: [], state: {} };
}

function createHistoryHarness(withNextAdapter = false) {
  const routerState = withNextAdapter ? { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: "same-page" } } : {};
  const stack: HistoryState[] = [{ page: "schools", ...routerState }, { page: "school-detail", ...routerState }];
  let index = 1;
  let preserveCustomHistoryState = false;
  let requestedUrlRestores = 0;
  const adapt = (state: HistoryState, url?: string) => {
    if (!withNextAdapter || state.__NA || state._N) return state;
    // Next only starts route restoration when the optional URL is supplied.
    if (url) { preserveCustomHistoryState = true; requestedUrlRestores += 1; }
    return Object.assign(state, routerState);
  };
  const listeners = new Set<(event: HistoryEvent) => void>();
  const traversals: Array<() => void> = [];
  const history = {
    get state() { return structuredClone(stack[index]!); },
    pushState(state: HistoryState, _unused?: string, url?: string) {
      stack.splice(index + 1);
      stack.push(structuredClone(adapt(state, url)));
      index += 1;
    },
    replaceState(state: HistoryState, _unused?: string, url?: string) { stack[index] = structuredClone(adapt(state, url)); },
    back() {
      // Browser history traversal is asynchronous; keeping this queued exposes
      // the old-close/new-dialog race that a synchronous stub would conceal.
      traversals.push(() => {
        if (index > 0) index -= 1;
        if (withNextAdapter) preserveCustomHistoryState = true;
        const event = { state: history.state };
        for (const listener of [...listeners]) listener(event);
      });
    },
  };
  const context = createContext({
    customHistoryState,
    window: {
      history,
      location: { href: "https://history.test/" },
      addEventListener: (_type: string, listener: (event: HistoryEvent) => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: (event: HistoryEvent) => void) => listeners.delete(listener),
    },
  });
  runInContext(`${compiledHistory}\n${compiledCloseCallback}\n globalThis.historyTest = {
    acquireSheetHistory, activateSheetHistory, consumeReleasedSheetHistory,
    traverseSheetHistory, pending: () => pendingSheetHistoryBack, entries: sheetHistoryEntries, closeCallback
  };`, context);
  return {
    api: context.historyTest as HistoryApi,
    history,
    stack,
    listeners,
    index: () => index,
    requestedUrlRestores: () => requestedUrlRestores,
    commitRouter() {
      history.replaceState({ ...(preserveCustomHistoryState ? history.state : {}), ...routerState });
    },
    async flush() {
      for (let step = 0; step < 12; step += 1) {
        traversals.shift()?.();
        await Promise.resolve();
      }
      expect(traversals).toHaveLength(0);
    },
  };
}

describe("owned bottom-sheet history", () => {
  it("reproduces why copying router-private markers loses a sheet on a later router commit", () => {
    const browser = createHistoryHarness(true);
    browser.history.pushState({ ...browser.history.state, onnuriwaySheet: "unsafe-replayed-state" });
    expect(browser.history.state.onnuriwaySheet).toBe("unsafe-replayed-state");
    browser.commitRouter();
    expect(browser.history.state.onnuriwaySheet).toBeUndefined();
  });
  it("retains the parent through repeated form saves without starting Next URL restorations", async () => {
    const browser = createHistoryHarness(true);
    const parent = entry("product-detail");
    browser.api.acquireSheetHistory(parent);
    const closed: string[] = [];
    browser.listeners.add(browser.api.closeCallback(parent, () => { closed.push(parent.id); parent.active = false; }));
    expect(browser.history.state.onnuriwaySheet).toBe(parent.id);
    expect(parent.state).not.toHaveProperty("__NA");
    for (const name of ["receive", "count", "issue"]) {
      const form = entry(name);
      browser.api.acquireSheetHistory(form);
      expect(browser.history.state.onnuriwaySheet).toBe(name);
      expect(form.ancestorIds).toEqual([parent.id]);
      form.active = false;
      browser.api.consumeReleasedSheetHistory();
      await browser.flush();
      browser.commitRouter();
      expect(browser.history.state.onnuriwaySheet).toBe(parent.id);
      expect(parent.active).toBe(true);
    }
    expect(closed).toEqual([]);
    expect(browser.requestedUrlRestores()).toBe(0);
  });
  it("closes only the top sheet in directory → detail → photo Back navigation", async () => {
    const browser = createHistoryHarness();
    const sheets = [entry("directory"), entry("detail"), entry("photo")];
    const closed: string[] = [];
    for (const sheet of sheets) {
      browser.api.acquireSheetHistory(sheet);
      browser.listeners.add(browser.api.closeCallback(sheet, () => { closed.push(sheet.id); sheet.active = false; }));
    }
    expect(sheets[2]!.ancestorIds).toEqual(["directory", "detail"]);
    browser.history.back(); await browser.flush();
    expect(closed).toEqual(["photo"]);
    expect(browser.history.state.onnuriwaySheet).toBe("detail");
    expect(sheets[0]!.ownsEntry).toBe(true);
    browser.history.back(); await browser.flush();
    expect(closed).toEqual(["photo", "detail"]);
    expect(browser.history.state.onnuriwaySheet).toBe("directory");
    browser.history.back(); await browser.flush();
    expect(closed).toEqual(["photo", "detail", "directory"]);
    expect(browser.history.state.page).toBe("school-detail");
  });

  it("preserves ancestry when a lazy third-level placeholder is replaced", async () => {
    const browser = createHistoryHarness();
    const directory = entry("directory"), detail = entry("detail"), loading = entry("photo-loading"), photo = entry("photo");
    for (const sheet of [directory, detail, loading]) browser.api.acquireSheetHistory(sheet);
    loading.active = false;
    browser.api.acquireSheetHistory(photo);
    expect(photo.ancestorIds).toEqual(["directory", "detail"]);
    const closed: string[] = [];
    for (const sheet of [directory, detail, photo]) browser.listeners.add(browser.api.closeCallback(sheet, () => { closed.push(sheet.id); sheet.active = false; }));
    browser.api.traverseSheetHistory(photo); await browser.flush();
    expect(closed).toEqual(["photo"]);
    expect(browser.history.state.onnuriwaySheet).toBe("detail");
    expect(directory.active).toBe(true);
    expect(browser.api.pending()).toBeNull();
  });

  it("reuses StrictMode setup and consumes the slot on programmatic close", async () => {
    const browser = createHistoryHarness();
    const sheet = entry("visit");
    browser.api.acquireSheetHistory(sheet);
    sheet.active = false;
    browser.api.activateSheetHistory(sheet);
    browser.api.acquireSheetHistory(sheet);
    browser.api.consumeReleasedSheetHistory();
    expect(browser.stack).toHaveLength(3);

    sheet.active = false;
    browser.api.consumeReleasedSheetHistory();
    await browser.flush();
    expect(browser.index()).toBe(1);
    browser.history.back();
    await browser.flush();
    expect(browser.history.state.page).toBe("schools");
  });

  it("hands a retired lazy placeholder slot to the real dialog", async () => {
    const browser = createHistoryHarness();
    const loading = entry("visit-loading");
    const ready = entry("visit-ready");
    browser.api.acquireSheetHistory(loading);
    loading.active = false;
    browser.api.acquireSheetHistory(ready);
    browser.api.consumeReleasedSheetHistory();
    await browser.flush();

    expect(browser.stack).toHaveLength(3);
    expect(browser.history.state.onnuriwaySheet).toBe("visit-ready");
    expect(loading.ownsEntry).toBe(false);
    ready.active = false;
    browser.api.consumeReleasedSheetHistory();
    await browser.flush();
    expect(browser.index()).toBe(1);
  });

  it("finishes an old close before acquiring a newly opened sheet", async () => {
    const browser = createHistoryHarness();
    const previous = entry("previous");
    const next = entry("next");
    browser.api.acquireSheetHistory(previous);
    previous.active = false;
    browser.api.consumeReleasedSheetHistory();
    const pending = browser.api.pending();
    expect(pending).not.toBeNull();
    void pending!.then(() => browser.api.acquireSheetHistory(next));
    await browser.flush();

    expect(browser.history.state.onnuriwaySheet).toBe("next");
    expect(browser.index()).toBe(2);
    expect(browser.stack).toHaveLength(3);
  });

  it("settles traversal after busy state restores the current sheet", async () => {
    const browser = createHistoryHarness();
    const sheet = entry("saving");
    let busy = true;
    browser.api.acquireSheetHistory(sheet);
    browser.listeners.add((event) => {
      if (busy && event.state.onnuriwaySheet !== sheet.id) browser.history.pushState(sheet.state);
    });
    browser.api.traverseSheetHistory(sheet);
    await browser.flush();

    expect(browser.history.state.onnuriwaySheet).toBe("saving");
    expect(browser.api.pending()).toBeNull();
    busy = false;
    sheet.active = false;
    browser.api.consumeReleasedSheetHistory();
    await browser.flush();
    expect(browser.index()).toBe(1);
  });

  it("does not traverse twice when requested close also unmounts the sheet", async () => {
    const browser = createHistoryHarness();
    const sheet = entry("closing");
    browser.api.acquireSheetHistory(sheet);
    browser.api.traverseSheetHistory(sheet);
    sheet.active = false;
    browser.api.consumeReleasedSheetHistory();
    await browser.flush();

    expect(browser.index()).toBe(1);
    expect(browser.api.entries.size).toBe(0);
  });

  it("consumes retired nested slots without consuming the underlying page", async () => {
    const browser = createHistoryHarness();
    const parent = entry("parent");
    const child = entry("child");
    browser.api.acquireSheetHistory(parent);
    browser.api.acquireSheetHistory(child);
    parent.active = false;
    child.active = false;
    browser.api.consumeReleasedSheetHistory();
    await browser.flush();

    expect(browser.history.state.page).toBe("school-detail");
    expect(browser.index()).toBe(1);
    expect(browser.api.entries.size).toBe(0);
  });
});
