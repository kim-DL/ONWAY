import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AuthLoadingScreen, LaunchTimingProvider } from "./auth-loading";

describe("privacy-safe application entry", () => {
  it.each(["boot", "session", "workspace"] as const)("shows the company name and local logo with one status during %s", (stage) => {
    const markup = renderToStaticMarkup(createElement(LaunchTimingProvider, null,
      createElement(AuthLoadingScreen, { stage })));
    expect(markup).toContain('class="auth-launch-brand"');
    expect(markup).toContain('src="/brand/onnuri-food-logo-auth.webp"');
    const heading = markup.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1];
    expect(heading?.replace(/<[^>]+>/g, "").replace(/\s+/g, "")).toBe("온누리종합식품");
    expect(markup).not.toContain("급식길");
    expect(markup).not.toContain("/icons/");
    expect(markup.match(/role="status"/g)).toHaveLength(1);
    expect(markup).toContain(`data-auth-stage="${stage}"`);
    expect(markup).not.toContain("workspace-navigation");
    expect(markup).not.toContain("data-loader-piece");
    expect(markup).not.toContain("aria-valuenow");
  });

  it("preserves recovery instructions instead of replacing them with a generic loading message", () => {
    const message = "로그인은 유지되어 있어요. 연결이 돌아오면 자동으로 이어집니다.";
    const markup = renderToStaticMarkup(createElement(AuthLoadingScreen, { stage: "session", message, waitingForConnection: true }));
    expect(markup).toContain(message);
    expect(markup.split(message)).toHaveLength(2);
    expect(markup).not.toContain("로그인 상태를 확인하고 있습니다.");
    expect(markup.match(/role="status"/g)).toHaveLength(1);
    expect(markup).toContain('data-auth-stage="connection"');
    expect(markup).not.toContain("data-loading-indicator");
  });
});
