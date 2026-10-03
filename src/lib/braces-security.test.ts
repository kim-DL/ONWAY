import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const braces = require("braces") as {
  (input: string, options?: { expand?: boolean }): string[];
  expand(input: string): string[];
};

describe("patched braces dependency", () => {
  it("resolves the test and micromatch to the vendored patch", () => {
    const patchedEntry = realpathSync(fileURLToPath(new URL("../../vendor/braces/index.js", import.meta.url)));
    const micromatchRequire = createRequire(require.resolve("micromatch"));

    expect(realpathSync(require.resolve("braces"))).toBe(patchedEntry);
    expect(realpathSync(micromatchRequire.resolve("braces"))).toBe(patchedEntry);
  });

  it("keeps ordinary nested brace expansion unchanged", () => {
    expect(braces("school/{detail,{photos,notes}}/", { expand: true })).toEqual([
      "school/detail/",
      "school/photos/",
      "school/notes/",
    ]);
  });

  it("rejects nesting beyond the guarded parser depth before recursive walkers run", () => {
    const boundaryPattern = `${"{".repeat(100)}left,right${"}".repeat(100)}`;
    const pattern = `${"{".repeat(101)}left,right${"}".repeat(101)}`;

    expect(braces.expand(boundaryPattern)).toHaveLength(2);
    expect(() => braces(pattern)).toThrow("Brace nesting depth exceeds max (100)");
    expect(() => braces.expand(pattern)).toThrow("Brace nesting depth exceeds max (100)");
  });
});
