import { readFileSync } from "node:fs";
import path from "node:path";
import tailwind from "@tailwindcss/postcss";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

describe("Tailwind production source boundaries", () => {
  it("does not watch generated screenshots and reports as application class sources", async () => {
    const stylesheet = path.resolve("src/app/globals.css");
    const outputDirectory = path.resolve("output");
    const sourceDirectory = path.resolve("src");
    const result = await postcss([tailwind()]).process(readFileSync(stylesheet, "utf8"), {
      from: stylesheet,
    });
    const watchedDirectories = result.messages
      .filter((message) => message.type === "dir-dependency")
      .map((message) => path.resolve(String(message.dir)));

    // Next watches the whole PostCSS directory dependency, not only its glob.
    // Captures written under output must not trigger an unrelated app refresh.
    expect(watchedDirectories.some((directory) => directory === outputDirectory || directory.startsWith(`${outputDirectory}${path.sep}`))).toBe(false);
    expect(watchedDirectories.some((directory) => directory === sourceDirectory || directory.startsWith(`${sourceDirectory}${path.sep}`))).toBe(true);
    expect(result.css).toContain("--mode-delivery-text");
  }, 20_000);
});
