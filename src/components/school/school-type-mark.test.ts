import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { School } from "@/domain/school";
import { SchoolTypeMark } from "./school-type-mark";

const SCHOOL_TYPES = [
  ["elementary", "초등학교"],
  ["middle", "중학교"],
  ["high", "고등학교"],
  ["special", "특수학교"],
  ["other", "기타 학교"],
] as const satisfies ReadonlyArray<readonly [School["schoolType"], string]>;

function markup(schoolType: School["schoolType"], className?: string) {
  return renderToStaticMarkup(createElement(SchoolTypeMark, { schoolType, ...(className === undefined ? {} : { className }) }));
}

function luminance(hex: string) {
  const channels = hex.match(/\w{2}/gu)!.map((channel) => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  });
  return channels[0]! * .2126 + channels[1]! * .7152 + channels[2]! * .0722;
}

describe("SchoolTypeMark", () => {
  it.each(SCHOOL_TYPES)("labels %s correctly without relying on color", (schoolType, label) => {
    const result = markup(schoolType);
    expect(result).toContain(`role="img" aria-label="${label}" title="${label}"`);
    expect(result).toContain(`data-school-type="${schoolType}"`);
    expect(result).toContain('aria-hidden="true" focusable="false"');
    expect(result).toContain('viewBox="0 0 24 24"');
    expect(result).toContain('width="20" height="20"');
    expect(result).not.toMatch(/<button|tabindex=/u);
  });

  it("provides a distinct SVG shape for every school level", () => {
    const shapes = SCHOOL_TYPES.map(([schoolType]) => markup(schoolType).match(/<svg[\s\S]*<\/svg>/u)![0]);
    expect(new Set(shapes).size).toBe(SCHOOL_TYPES.length);
  });

  it("preserves layout className and safely falls back to other for an unexpected runtime value", () => {
    expect(markup("elementary", "assignment-card__type")).toContain("assignment-card__type");
    const fallback = markup("unknown-source-value" as School["schoolType"]);
    expect(fallback).toContain('aria-label="기타 학교"');
    expect(fallback).toContain('data-school-type="other"');
    expect(fallback.match(/<svg[\s\S]*<\/svg>/u)![0]).toBe(markup("other").match(/<svg[\s\S]*<\/svg>/u)![0]);
  });

  it("keeps compact dimensions and at least 3:1 non-text contrast in all five palettes", () => {
    const css = readFileSync(new URL("./school-type-mark.module.css", import.meta.url), "utf8");
    expect(css).toContain("width: 36px;");
    expect(css).toContain("height: 36px;");
    for (const [schoolType] of SCHOOL_TYPES) {
      const declarations = css.match(new RegExp(`\\.${schoolType}\\s*\\{([^}]+)\\}`, "u"))![1]!;
      const ink = declarations.match(/--school-type-ink:\s*(#[\da-f]{6})/u)![1]!;
      const surface = declarations.match(/--school-type-surface:\s*(#[\da-f]{6})/u)![1]!;
      expect((luminance(surface) + .05) / (luminance(ink) + .05)).toBeGreaterThanOrEqual(3);
    }
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain("color: CanvasText;");
  });
});
