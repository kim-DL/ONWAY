import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

interface SheetEntry {
  id: string;
  active: boolean;
  ownsEntry: boolean;
  generation: number;
  state: Record<string, unknown>;
}

interface HistoryApi {
  acquireSheetHistory: (entry: SheetEntry) => void;
  activateSheetHistory: (entry: SheetEntry) => number;
  consumeReleasedSheetHistory: () => void;
  traverseSheetHistory: (entry: SheetEntry) => void;
  pending: () => Promise<void> | null;
  entries: Map<string, SheetEntry>;
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

function entry(id: string): SheetEntry {
  return { id, active: true, ownsEntry: false, generation: 1, state: {} };
}

function createHistoryHarness() {
  const stack: HistoryState[] = [{ page: "schools" }, { page: "school-detail" }];
  let index = 1;
  const listeners = new Set<(event: HistoryEvent) => void>();
  const traversals: Array<() => void> = [];
  const history = {
    get state() { return structuredClone(stack[index]!); },
    pushState(state: HistoryState) {
      stack.splice(index + 1);
      stack.push(structuredClone(state));
      index += 1;
    },
    replaceState(state: HistoryState) { stack[index] = structuredClone(state); },
    back() {
      // Browser history traversal is asynchronous; keeping this queued exposes
      // the old-close/new-dialog race that a synchronous stub would conceal.
      traversals.push(() => {
        if (index > 0) index -= 1;
        const event = { state: history.state };
        for (const listener of [...listeners]) listener(event);
      });
    },
  };
  const context = createContext({
    window: {
      history,
      location: { href: "https://history.test/" },
      addEventListener: (_type: string, listener: (event: HistoryEvent) => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: (event: HistoryEvent) => void) => listeners.delete(listener),
    },
  });
  runInContext(`${compiledHistory}\n globalThis.historyTest = {
    acquireSheetHistory, activateSheetHistory, consumeReleasedSheetHistory,
    traverseSheetHistory, pending: () => pendingSheetHistoryBack, entries: sheetHistoryEntries
  };`, context);
  return {
    api: context.historyTest as HistoryApi,
    history,
    stack,
    listeners,
    index: () => index,
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
