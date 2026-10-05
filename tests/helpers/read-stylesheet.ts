import { readFileSync } from "node:fs";

/** Inline local imports for fixtures that inject source CSS into a style tag. */
export function readStylesheet(file: URL, ancestors: readonly string[] = []): string {
  if (ancestors.includes(file.href)) throw new Error(`Circular stylesheet import: ${file.href}`);
  return readFileSync(file, "utf8").replace(
    /^@import\s+["'](\.[^"']+)["'][ \t]*;/gm,
    (_rule, relativePath: string) => readStylesheet(new URL(relativePath, file), [...ancestors, file.href]),
  );
}
