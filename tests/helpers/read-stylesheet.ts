import { readFileSync } from "node:fs";

/** Component fixtures render an authenticated workspace without Next's CSS loader. */
export function readApplicationStylesheet(): string {
  return readStylesheet(new URL("../../src/app/globals.css", import.meta.url))
    + readStylesheet(new URL("../../src/app/workspace.css", import.meta.url));
}

/** Inline local imports for fixtures that inject source CSS into a style tag. */
export function readStylesheet(file: URL, ancestors: readonly string[] = []): string {
  if (ancestors.includes(file.href)) throw new Error(`Circular stylesheet import: ${file.href}`);
  return readFileSync(file, "utf8").replace(
    /^@import\s+["'](\.[^"']+)["'][ \t]*;/gm,
    (_rule, relativePath: string) => readStylesheet(new URL(relativePath, file), [...ancestors, file.href]),
  );
}
