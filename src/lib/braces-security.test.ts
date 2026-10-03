import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const braces = require("braces") as {
  (input: string, options?: { expand?: boolean }): string[];
  expand(input: string): string[];
};

describe("patched braces dependency", () => {
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
