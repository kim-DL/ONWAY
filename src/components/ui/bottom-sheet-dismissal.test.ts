import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { customHistoryState } from "@/lib/browser-history";

const source = ts.createSourceFile("bottom-sheet.tsx", readFileSync(new URL("./bottom-sheet.tsx", import.meta.url), "utf8"), ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);

// Execute the production callback declarations, not a copy of their logic.
// Browser integration covers actual dialog focus and native history traversal.
function productionCallback(name: string, context: Record<string, unknown>) {
  let declaration: ts.VariableDeclaration | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) declaration = node;
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!declaration) throw new Error(`Missing production callback ${name}`);
  const output = ts.transpileModule(`const ${declaration.getText(source)}; globalThis.callback = ${name};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandbox = createContext(context);
  runInContext(output, sandbox);
  return sandbox.callback as (event?: { state: Record<string, unknown> }) => void;
}

function context() {
  const entry = { ownsEntry: true, id: "customer-editor", state: { page: "customers", onnuriwaySheet: "customer-editor" } };
  return {
    customHistoryState,
    entry, historyId: entry.id, isCurrent: () => true,
    closingRef: { current: false }, dismissibleRef: { current: true }, busyActionsRef: { current: new Set<string>() },
    beforeCloseRef: { current: vi.fn(() => false) }, onCloseRef: { current: vi.fn() },
    historyEntryRef: { current: entry },
    sheetHistoryEntries: new Map([[entry.id, entry]]),
    window: { history: { state: entry.state, pushState: vi.fn() }, location: { href: "https://app.test/" } },
    traverseSheetHistory: vi.fn(), useCallback: (callback: unknown) => callback,
  };
}

describe("bottom-sheet unsaved draft dismissal", () => {
  it("does not traverse history when the user declines a close-button confirmation", () => {
    const harness = context();
    productionCallback("requestClose", harness)();
    expect(harness.beforeCloseRef.current).toHaveBeenCalledOnce();
    expect(harness.traverseSheetHistory).not.toHaveBeenCalled();
    expect(harness.onCloseRef.current).not.toHaveBeenCalled();
    expect(harness.entry.ownsEntry).toBe(true);
  });

  it("restores the owned entry on declined native Back, then permits another Back", () => {
    const harness = context();
    const callback = productionCallback("closeFromHistory", harness);
    callback({ state: { page: "customers" } });
    expect(harness.window.history.pushState).toHaveBeenCalledWith(harness.entry.state, "");
    expect(harness.entry.ownsEntry).toBe(true);
    expect(harness.onCloseRef.current).not.toHaveBeenCalled();
    harness.beforeCloseRef.current.mockReturnValue(true);
    callback({ state: { page: "customers" } });
    expect(harness.onCloseRef.current).toHaveBeenCalledOnce();
    expect(harness.entry.ownsEntry).toBe(false);
  });

  it("does not ask twice when a confirmed button-close completes its Back traversal", () => {
    const harness = context();
    harness.beforeCloseRef.current.mockReturnValue(true);
    productionCallback("requestClose", harness)();
    expect(harness.closingRef.current).toBe(true);
    productionCallback("closeFromHistory", harness)({ state: { page: "customers" } });
    expect(harness.beforeCloseRef.current).toHaveBeenCalledOnce();
    expect(harness.onCloseRef.current).toHaveBeenCalledOnce();
  });

  it("keeps saving protection ahead of draft confirmation", () => {
    const harness = context();
    harness.busyActionsRef.current.add("save");
    productionCallback("requestClose", harness)();
    productionCallback("closeFromHistory", harness)({ state: { page: "customers" } });
    expect(harness.beforeCloseRef.current).not.toHaveBeenCalled();
    expect(harness.onCloseRef.current).not.toHaveBeenCalled();
    expect(harness.window.history.pushState).toHaveBeenCalledOnce();
  });
});
