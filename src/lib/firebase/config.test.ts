import { describe, expect, it } from "vitest";

import { resolveFirebasePublicConfig } from "./config";

const completeConfig = {
  apiKey: "test-api-key",
  authDomain: "demo-onnuriway.firebaseapp.com",
  projectId: "demo-onnuriway",
  storageBucket: "demo-onnuriway.firebasestorage.app",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:test",
};

describe("resolveFirebasePublicConfig", () => {
  it("allows builds without a production Firebase project", () => {
    expect(resolveFirebasePublicConfig({})).toBeNull();
  });

  it("returns a complete configuration", () => {
    expect(resolveFirebasePublicConfig(completeConfig)).toEqual(completeConfig);
  });

  it("fails fast when only part of the configuration is present", () => {
    expect(() => resolveFirebasePublicConfig({ apiKey: "partial" })).toThrow(
      "Firebase public configuration is incomplete",
    );
  });
});
