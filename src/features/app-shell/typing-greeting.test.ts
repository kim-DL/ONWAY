import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { splitGreeting, TypingGreeting } from "./typing-greeting";

describe("typing greeting contract", () => {
  it("keeps Korean syllables, combined accents and emoji clusters intact", () => {
    expect(splitGreeting("김대인 부장님")).toEqual(["김", "대", "인", " ", "부", "장", "님"]);
    expect(splitGreeting("김e\u0301👩‍💻")).toEqual(["김", "e\u0301", "👩‍💻"]);
    expect(splitGreeting("")).toEqual([]);
  });

  it("serves a readable full phrase before hydration without live announcements", () => {
    const text = "김대인 부장님, 오늘 하루도 수고가 많으셨습니다.";
    const html = renderToString(createElement(TypingGreeting, { text, active: true, disabled: false }));
    expect(html).toContain(`data-greeting-accessible="true">${text}</span>`);
    expect(html).toContain('aria-hidden="true" data-greeting-visual="true"');
    expect(html).toContain('data-typing="complete"');
    expect(html.match(/data-greeting-character=/g)).toHaveLength(splitGreeting(text).length);
    expect(html).not.toContain("visibility:hidden");
    expect(html).not.toContain("aria-live");
    expect(html).not.toContain('role="status"');
  });
});
