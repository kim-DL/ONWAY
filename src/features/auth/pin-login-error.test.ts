import { describe, expect, it } from "vitest";

import { classifyPinLoginError, type PinLoginStage } from "./pin-login-error";

describe("PIN login failure classification", () => {
  it.each([
    ["credentials", "functions/unauthenticated", "invalid-credential"],
    ["credentials", "functions/resource-exhausted", "rate-limited"],
    ["credentials", "functions/unavailable", "network"],
    ["credentials", "functions/deadline-exceeded", "network"],
    ["app-check", "appCheck/recaptcha-error", "security"],
    ["app-check", "appCheck/throttled", "security"],
    ["app-check", "appCheck/fetch-network-error", "network"],
    ["app-check", "appCheck/deadline-exceeded", "network"],
    ["token-exchange", "auth/network-request-failed", "network"],
    ["token-exchange", "auth/invalid-custom-token", "session"],
    ["token-exchange", "auth/custom-token-mismatch", "session"],
    ["persistence", "auth/unsupported-persistence-type", "storage"],
    ["credentials", "functions/internal", "service"],
  ] as const)("classifies %s / %s as %s", (stage, code, kind) => {
    expect(classifyPinLoginError({ code }, stage).kind).toBe(kind);
  });

  it("keeps unknown/inactive/stale credential rejections generic without reflecting backend detail", () => {
    for (const message of ["unknown employee", "inactive employee", "stale credentials"]) {
      expect(classifyPinLoginError({ code: "functions/unauthenticated", message }, "credentials")).toEqual({
        kind: "invalid-credential", message: "PIN을 확인해주세요.",
      });
    }
  });

  it("does not blame the PIN for unexpected errors at any stage", () => {
    for (const stage of ["app-check", "credentials", "persistence", "token-exchange"] satisfies PinLoginStage[]) {
      const result = classifyPinLoginError(new Error("private provider detail"), stage);
      expect(result.kind).not.toBe("invalid-credential");
      expect(result.message).not.toContain("private provider detail");
    }
  });
});
