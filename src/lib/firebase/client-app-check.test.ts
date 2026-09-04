import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  app: {}, appCheck: {},
  getApps: vi.fn(), getToken: vi.fn(), initializeAppCheck: vi.fn(),
  config: vi.fn(),
}));
vi.mock("client-only", () => ({}));
vi.mock("firebase/app", async (original) => ({
  ...await original<typeof import("firebase/app")>(),
  getApps: sdk.getApps, getApp: () => sdk.app, initializeApp: () => sdk.app,
}));
vi.mock("firebase/app-check", () => ({
  getToken: sdk.getToken, initializeAppCheck: sdk.initializeAppCheck,
  ReCaptchaEnterpriseProvider: class {},
}));
vi.mock("firebase/auth", () => ({ getAuth: () => ({}), connectAuthEmulator: vi.fn() }));
vi.mock("firebase/firestore", () => ({
  getFirestore: () => ({}), initializeFirestore: () => ({}),
  memoryLocalCache: vi.fn(), connectFirestoreEmulator: vi.fn(),
}));
vi.mock("firebase/functions", () => ({ getFunctions: () => ({}), connectFunctionsEmulator: vi.fn() }));
vi.mock("./config", () => ({ getFirebasePublicConfig: sdk.config }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_USE_FIREBASE_EMULATORS", "false");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY", "fixture-site-key");
  sdk.getApps.mockReturnValue([]);
  sdk.config.mockReturnValue({ projectId: "demo-onnuriway" });
  sdk.initializeAppCheck.mockReturnValue(sdk.appCheck);
  sdk.getToken.mockReset().mockResolvedValue({ token: "fixture-not-a-real-token" });
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("PIN app verification preflight", () => {
  it("reuses the SDK token cache and returns no token to callers", async () => {
    const client = await import("./client");
    await expect(client.ensureFirebaseAppCheckReady()).resolves.toBeUndefined();
    await client.ensureFirebaseAppCheckReady();
    expect(sdk.initializeAppCheck).toHaveBeenCalledTimes(1);
    expect(sdk.getToken).toHaveBeenCalledWith(sdk.appCheck, false);
  });

  it("retains app verification when Firebase was initialized earlier", async () => {
    sdk.getApps.mockReturnValue([sdk.app]);
    const client = await import("./client");
    await client.ensureFirebaseAppCheckReady();
    expect(sdk.initializeAppCheck).toHaveBeenCalledTimes(1);
    expect(sdk.getToken).toHaveBeenCalled();
  });

  it("skips the production provider only in the explicit emulator build", async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_FIREBASE_EMULATORS", "true");
    const client = await import("./client");
    await client.ensureFirebaseAppCheckReady();
    expect(sdk.getToken).not.toHaveBeenCalled();
  });

  it("fails closed if production app verification is unconfigured", async () => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY", "");
    const client = await import("./client");
    await expect(client.ensureFirebaseAppCheckReady()).rejects.toMatchObject({ code: "appCheck/unconfigured" });
    expect(sdk.getToken).not.toHaveBeenCalled();
  });

  it("preserves provider errors and permits a later explicit retry", async () => {
    const error = { code: "appCheck/recaptcha-error" };
    sdk.getToken.mockRejectedValueOnce(error);
    const client = await import("./client");
    await expect(client.ensureFirebaseAppCheckReady()).rejects.toBe(error);
    await expect(client.ensureFirebaseAppCheckReady()).resolves.toBeUndefined();
  });

  it("bounds a stalled check without letting its late result trigger login", async () => {
    vi.useFakeTimers();
    let complete!: (result: { token: string }) => void;
    sdk.getToken.mockReturnValueOnce(new Promise((resolve) => { complete = resolve; }));
    const client = await import("./client");
    const failure = expect(client.ensureFirebaseAppCheckReady()).rejects.toMatchObject({ code: "appCheck/deadline-exceeded" });
    await vi.advanceTimersByTimeAsync(12_000);
    await failure;
    complete({ token: "late-fixture" });
    await expect(client.ensureFirebaseAppCheckReady()).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
});
