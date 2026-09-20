import type { ReactElement } from "react";
import { FirebaseError } from "firebase/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

type FakeUser = { uid: string; displayName: string; getIdTokenResult: () => Promise<{ claims: Record<string, unknown> }> };
type FakeSnapshot = { metadata: { fromCache: boolean }; exists: () => boolean; data: () => unknown };

const harness = vi.hoisted(() => ({
  effect: undefined as (() => void | (() => void)) | undefined,
  setState: vi.fn(),
  setPersistence: vi.fn<() => Promise<void>>(),
  onIdTokenChanged: vi.fn(),
  onSnapshot: vi.fn(),
  signOut: vi.fn(),
  clearPrivateClientState: vi.fn<() => Promise<void>>(),
  ensureFirebaseAppCheckReady: vi.fn<() => Promise<void>>(),
  employeeLogin: vi.fn<() => Promise<{ data: { customToken: string } }>>(),
  employeeLogout: vi.fn<() => Promise<{ data: { ok: boolean } }>>(),
  signInWithCustomToken: vi.fn<() => Promise<unknown>>(),
  signInWithPopup: vi.fn<() => Promise<unknown>>(),
  writeVerifiedOfflineSession: vi.fn(),
}));

// Execute the actual provider effect with controlled SDK callbacks. This tests
// asynchronous observer lifetime without adding a DOM renderer dependency.
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useEffect: (effect: () => void | (() => void)) => { harness.effect = effect; },
  useState: (value: unknown) => [value, harness.setState],
  useRef: (value: unknown) => ({ current: value }),
  useMemo: (compute: () => unknown) => compute(),
  useCallback: (callback: unknown) => callback,
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
}));
vi.mock("firebase/auth", () => ({
  browserLocalPersistence: {}, GoogleAuthProvider: class {},
  setPersistence: harness.setPersistence, onIdTokenChanged: harness.onIdTokenChanged,
  signOut: harness.signOut,
  signInWithPopup: harness.signInWithPopup,
  signInWithCustomToken: harness.signInWithCustomToken,
}));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, collection: string, uid: string) => ({ collection, uid }),
  getDocFromServer: vi.fn(), onSnapshot: harness.onSnapshot,
}));
vi.mock("firebase/functions", () => ({
  httpsCallable: (_functions: unknown, name: string) => name === "employeeLogout"
    ? harness.employeeLogout
    : harness.employeeLogin,
}));
vi.mock("@/lib/firebase/client", () => ({
  getFirebaseClientServices: () => ({ auth: {}, firestore: {}, functions: {} }),
  ensureFirebaseAppCheckReady: harness.ensureFirebaseAppCheckReady,
}));
vi.mock("@/lib/performance/performance-monitor", () => ({ recordFirestoreReads: vi.fn() }));
vi.mock("@/features/pwa/network-status", () => ({
  probeNetworkReachability: async () => true, subscribeToNetworkRecovery: vi.fn(),
}));
vi.mock("./offline-session", () => ({
  readVerifiedOfflineSession: () => null, writeVerifiedOfflineSession: harness.writeVerifiedOfflineSession,
}));
vi.mock("./private-client-state", () => ({ clearPrivateClientState: harness.clearPrivateClientState }));

import { AuthProvider } from "./auth-context";

function mountObserver() {
  AuthProvider({ children: null });
  const cleanup = harness.effect?.();
  if (!cleanup) throw new Error("Expected an active auth effect");
  return cleanup;
}

function renderProvider() {
  return (AuthProvider({ children: null }) as ReactElement<{ value: {
    login: (pin: string) => Promise<void>;
    loginWithGoogle: () => Promise<void>;
    logout: () => Promise<void>;
    dismissInvalidSession: () => void;
  } }>).props.value;
}

async function flushCallbacks() {
  for (let step = 0; step < 8; step += 1) await Promise.resolve();
}

function user(uid: string): FakeUser {
  return {
    uid, displayName: uid,
    getIdTokenResult: async () => ({ claims: {
      employeeId: `EMP-${uid}`, roleScopes: ["sales"], sessionVersion: 1, permissionsVersion: 1,
      firebase: { sign_in_provider: "custom" },
    } }),
  };
}

function authz(uid: string): FakeSnapshot {
  return {
    metadata: { fromCache: false }, exists: () => true,
    data: () => ({ employeeId: `EMP-${uid}`, active: true, sessionVersion: 1, permissionsVersion: 1 }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  harness.effect = undefined;
  harness.setPersistence.mockReset().mockResolvedValue(undefined);
  harness.onIdTokenChanged.mockReset().mockReturnValue(vi.fn());
  harness.onSnapshot.mockReset().mockReturnValue(vi.fn());
  harness.signOut.mockReset().mockResolvedValue(undefined);
  harness.clearPrivateClientState.mockReset().mockResolvedValue(undefined);
  harness.ensureFirebaseAppCheckReady.mockReset().mockResolvedValue(undefined);
  harness.employeeLogin.mockReset().mockResolvedValue({ data: { customToken: "test-only-custom-token" } });
  harness.employeeLogout.mockReset().mockResolvedValue({ data: { ok: true } });
  harness.signInWithCustomToken.mockReset().mockResolvedValue(undefined);
  harness.signInWithPopup.mockReset().mockResolvedValue(undefined);
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => { resolve = finish; });
  return { promise, resolve };
}

describe("private-screen session termination", () => {
  it("hides a revoked session before deferred private cleanup and ignores queued authz/token callbacks", async () => {
    const cleanupPending = deferred<void>();
    harness.clearPrivateClientState.mockReturnValueOnce(cleanupPending.promise);
    const context = renderProvider();
    const cleanup = harness.effect?.();
    await flushCallbacks();
    const tokenCallback = harness.onIdTokenChanged.mock.calls[0]![1] as (current: FakeUser | null) => void;
    tokenCallback(user("A"));
    await flushCallbacks();
    const snapshotCallback = harness.onSnapshot.mock.calls[0]![1] as (snapshot: FakeSnapshot) => void;
    snapshotCallback(authz("A"));
    harness.setState.mockClear();
    harness.writeVerifiedOfflineSession.mockClear();

    snapshotCallback({
      ...authz("A"),
      data: () => ({ employeeId: "EMP-A", active: false, sessionVersion: 1, permissionsVersion: 1 }),
    });
    expect(harness.setState).toHaveBeenLastCalledWith({
      status: "invalid", message: "세션이 변경되었습니다. 다시 로그인해주세요.",
    });
    expect(harness.clearPrivateClientState).toHaveBeenCalledTimes(1);
    expect(harness.signOut).not.toHaveBeenCalled();

    harness.setState.mockClear();
    snapshotCallback(authz("A"));
    tokenCallback(user("A"));
    tokenCallback(null);
    await flushCallbacks();
    expect(harness.setState).not.toHaveBeenCalled();
    expect(harness.writeVerifiedOfflineSession).not.toHaveBeenCalled();
    expect(harness.onSnapshot).toHaveBeenCalledTimes(1);

    cleanupPending.resolve(undefined);
    await flushCallbacks();
    expect(harness.signOut).toHaveBeenCalledTimes(1);
    snapshotCallback(authz("A"));
    tokenCallback(user("A"));
    await flushCallbacks();
    expect(harness.setState).not.toHaveBeenCalled();
    context.dismissInvalidSession();
    expect(harness.setState).toHaveBeenLastCalledWith({ status: "unauthenticated" });
    if (cleanup) cleanup();
  });

  it("queues return-to-login until both private cleanup and the old signOut finish", async () => {
    const cleanupPending = deferred<void>();
    const signOutPending = deferred<void>();
    harness.clearPrivateClientState.mockReturnValueOnce(cleanupPending.promise);
    harness.signOut.mockReturnValueOnce(signOutPending.promise);
    const context = renderProvider();
    const cleanup = harness.effect?.();
    await flushCallbacks();
    const tokenCallback = harness.onIdTokenChanged.mock.calls[0]![1] as (current: FakeUser | null) => void;
    tokenCallback(user("A"));
    await flushCallbacks();
    const snapshotCallback = harness.onSnapshot.mock.calls[0]![1] as (snapshot: FakeSnapshot) => void;
    snapshotCallback({ metadata: { fromCache: false }, exists: () => false, data: () => undefined });
    context.dismissInvalidSession();
    expect(harness.setState).toHaveBeenLastCalledWith({ status: "resolving" });
    harness.setState.mockClear();
    tokenCallback(null);
    cleanupPending.resolve(undefined);
    await flushCallbacks();
    expect(harness.signOut).toHaveBeenCalledTimes(1);
    expect(harness.setState).not.toHaveBeenCalled();
    signOutPending.resolve(undefined);
    await flushCallbacks();
    expect(harness.setState).toHaveBeenLastCalledWith({ status: "unauthenticated" });

    await context.login("test-only-pin");
    tokenCallback(user("B"));
    await flushCallbacks();
    const freshSnapshot = harness.onSnapshot.mock.calls[1]![1] as (snapshot: FakeSnapshot) => void;
    freshSnapshot(authz("B"));
    expect(harness.setState).toHaveBeenLastCalledWith(expect.objectContaining({
      status: "authenticated", session: expect.objectContaining({ uid: "B" }),
    }));
    if (cleanup) cleanup();
  });

  it("hides immediately while remote logout and cleanup are pending, without stale reauthentication", async () => {
    const remotePending = deferred<{ data: { ok: boolean } }>();
    const cleanupPending = deferred<void>();
    harness.employeeLogout.mockReturnValueOnce(remotePending.promise);
    harness.clearPrivateClientState.mockReturnValueOnce(cleanupPending.promise);
    const context = renderProvider();
    const cleanup = harness.effect?.();
    await flushCallbacks();
    const tokenCallback = harness.onIdTokenChanged.mock.calls[0]![1] as (current: FakeUser | null) => void;
    tokenCallback(user("A"));
    await flushCallbacks();
    const snapshotCallback = harness.onSnapshot.mock.calls[0]![1] as (snapshot: FakeSnapshot) => void;
    snapshotCallback(authz("A"));
    harness.setState.mockClear();
    harness.writeVerifiedOfflineSession.mockClear();

    const attempt = context.logout();
    expect(harness.setState).toHaveBeenLastCalledWith({ status: "resolving" });
    expect(harness.employeeLogout).toHaveBeenCalledTimes(1);
    expect(harness.clearPrivateClientState).not.toHaveBeenCalled();
    harness.setState.mockClear();
    snapshotCallback(authz("A"));
    tokenCallback(user("A"));
    await flushCallbacks();
    expect(harness.setState).not.toHaveBeenCalled();
    expect(harness.writeVerifiedOfflineSession).not.toHaveBeenCalled();
    await context.logout();
    expect(harness.employeeLogout).toHaveBeenCalledTimes(1);

    remotePending.resolve({ data: { ok: true } });
    await flushCallbacks();
    expect(harness.clearPrivateClientState).toHaveBeenCalledTimes(1);
    tokenCallback(null);
    expect(harness.setState).not.toHaveBeenCalled();
    cleanupPending.resolve(undefined);
    await attempt;
    expect(harness.signOut).toHaveBeenCalledTimes(1);
    expect(harness.setState).toHaveBeenLastCalledWith({ status: "unauthenticated" });
    harness.setState.mockClear();
    snapshotCallback(authz("A"));
    expect(harness.setState).not.toHaveBeenCalled();
    if (cleanup) cleanup();
  });

  it("ignores a token result that finishes after logout starts", async () => {
    const tokenPending = deferred<{ claims: Record<string, unknown> }>();
    const context = renderProvider();
    const cleanup = harness.effect?.();
    await flushCallbacks();
    const tokenCallback = harness.onIdTokenChanged.mock.calls[0]![1] as (current: FakeUser | null) => void;
    tokenCallback({ ...user("A"), getIdTokenResult: () => tokenPending.promise });
    await flushCallbacks();
    await context.logout();
    harness.setState.mockClear();
    tokenPending.resolve(await user("A").getIdTokenResult());
    await flushCallbacks();
    expect(harness.onSnapshot).not.toHaveBeenCalled();
    expect(harness.setState).not.toHaveBeenCalled();
    expect(harness.writeVerifiedOfflineSession).not.toHaveBeenCalled();
    if (cleanup) cleanup();
  });

  it("keeps sensitive screens hidden if local signOut rejects", async () => {
    const context = renderProvider();
    harness.signOut.mockRejectedValueOnce(new Error("private storage detail"));
    await expect(context.logout()).rejects.toThrow("private storage detail");
    expect(harness.setState).toHaveBeenNthCalledWith(1, { status: "resolving" });
    expect(harness.setState).toHaveBeenLastCalledWith({
      status: "invalid", message: "로그아웃을 완료하지 못했습니다. 앱을 다시 열어 로그인해주세요.",
    });
    expect(harness.setState).not.toHaveBeenCalledWith(expect.objectContaining({ status: "authenticated" }));
  });
});

describe("PIN login failure recovery", () => {
  it("does not send a PIN request when App Check fails and permits a later retry", async () => {
    const context = renderProvider();
    harness.ensureFirebaseAppCheckReady.mockRejectedValueOnce(new FirebaseError("appCheck/recaptcha-error", "private provider detail"));

    await expect(context.login("test-only-pin")).rejects.toThrow("앱 보안 확인을 완료하지 못했어요.");
    expect(harness.employeeLogin).not.toHaveBeenCalled();
    expect(harness.signInWithCustomToken).not.toHaveBeenCalled();
    expect(harness.setState).toHaveBeenLastCalledWith({
      status: "unauthenticated", message: "앱 보안 확인을 완료하지 못했어요. 정식 앱 주소에서 다시 접속해주세요.",
    });

    await context.login("test-only-pin");
    expect(harness.ensureFirebaseAppCheckReady).toHaveBeenCalledTimes(2);
    expect(harness.employeeLogin).toHaveBeenCalledTimes(1);
    expect(harness.signInWithCustomToken).toHaveBeenCalledTimes(1);
  });

  it("keeps the form mounted through a pending/rejected exchange and verifies authz after retry", async () => {
    const context = renderProvider();
    const cleanup = harness.effect?.();
    await flushCallbacks();
    const tokenCallback = harness.onIdTokenChanged.mock.calls[0]![1] as (current: FakeUser | null) => void;
    tokenCallback(null);
    harness.setState.mockClear();
    let rejectExchange!: (error: unknown) => void;
    harness.signInWithCustomToken.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectExchange = reject; }));

    const attempt = context.login("test-only-pin");
    const rejected = expect(attempt).rejects.toThrow("연결이 원활하지 않아요.");
    await flushCallbacks();
    expect(harness.signInWithCustomToken).toHaveBeenCalledTimes(1);
    expect(harness.setState).not.toHaveBeenCalled();
    rejectExchange(new FirebaseError("auth/network-request-failed", "private provider detail"));
    await rejected;
    expect(harness.setState).toHaveBeenLastCalledWith({
      status: "unauthenticated", message: "연결이 원활하지 않아요. 인터넷 연결을 확인한 뒤 다시 시도해주세요.",
    });

    harness.setState.mockClear();
    harness.signInWithCustomToken.mockImplementationOnce(async () => { tokenCallback(user("RETRY")); });
    await context.login("test-only-pin");
    await flushCallbacks();
    expect(harness.setState).not.toHaveBeenCalledWith(expect.objectContaining({ status: "authenticated" }));
    const snapshotCallback = harness.onSnapshot.mock.calls[0]![1] as (snapshot: FakeSnapshot) => void;
    snapshotCallback(authz("RETRY"));
    expect(harness.setState).toHaveBeenLastCalledWith(expect.objectContaining({
      status: "authenticated", session: expect.objectContaining({ uid: "RETRY" }),
    }));
    if (cleanup) cleanup();
  });

  it("does not exchange a token when browser persistence fails", async () => {
    const context = renderProvider();
    harness.setPersistence.mockRejectedValueOnce(new FirebaseError("auth/unsupported-persistence-type", "private detail"));
    await expect(context.login("test-only-pin")).rejects.toThrow("이 브라우저에서 로그인 상태를 저장할 수 없습니다.");
    expect(harness.signInWithCustomToken).not.toHaveBeenCalled();
    expect(harness.setState).not.toHaveBeenCalledWith({ status: "resolving" });
  });

  it("preserves the generic invalid-PIN response without disclosing the underlying employee check", async () => {
    const context = renderProvider();
    harness.employeeLogin.mockRejectedValueOnce(new FirebaseError("functions/unauthenticated", "inactive employee"));
    await expect(context.login("test-only-pin")).rejects.toThrow("PIN을 확인해주세요.");
    expect(harness.setState).toHaveBeenLastCalledWith({ status: "unauthenticated", message: "PIN을 확인해주세요." });
    expect(harness.signInWithCustomToken).not.toHaveBeenCalled();
  });

  it("carries a safe administrator error to the newly mounted login form", async () => {
    const context = renderProvider();
    harness.signInWithPopup.mockRejectedValueOnce(new FirebaseError("auth/popup-blocked", "private provider detail"));
    await expect(context.loginWithGoogle()).rejects.toThrow("브라우저의 팝업 차단을 해제한 뒤 다시 시도해주세요.");
    expect(harness.setState).toHaveBeenLastCalledWith({
      status: "unauthenticated", message: "브라우저의 팝업 차단을 해제한 뒤 다시 시도해주세요.",
    });
  });
});

describe("auth observer effect lifecycle", () => {
  it("does not subscribe if persistence finishes after effect cleanup", async () => {
    let finishPersistence!: () => void;
    harness.setPersistence.mockReturnValue(new Promise<void>((resolve) => { finishPersistence = resolve; }));
    const cleanup = mountObserver();
    cleanup();
    finishPersistence();
    await flushCallbacks();

    expect(harness.onIdTokenChanged).not.toHaveBeenCalled();
    expect(harness.setState).not.toHaveBeenCalled();
  });

  it("ignores an already queued token callback after cleanup", async () => {
    const cleanup = mountObserver();
    await flushCallbacks();
    const tokenCallback = harness.onIdTokenChanged.mock.calls[0]![1] as (current: FakeUser | null) => void;
    cleanup();
    tokenCallback(null);
    tokenCallback(user("A"));
    await flushCallbacks();

    expect(harness.setState).not.toHaveBeenCalled();
    expect(harness.onSnapshot).not.toHaveBeenCalled();
  });

  it("never publishes or invalidates a new account from a stale authz callback", async () => {
    const cleanup = mountObserver();
    await flushCallbacks();
    const tokenCallback = harness.onIdTokenChanged.mock.calls[0]![1] as (current: FakeUser | null) => void;
    tokenCallback(user("A"));
    await flushCallbacks();
    const previousSnapshot = harness.onSnapshot.mock.calls[0]![1] as (snapshot: FakeSnapshot) => void;
    tokenCallback(user("B"));
    await flushCallbacks();
    const currentSnapshot = harness.onSnapshot.mock.calls[1]![1] as (snapshot: FakeSnapshot) => void;
    harness.setState.mockClear();

    previousSnapshot(authz("A"));
    previousSnapshot({ metadata: { fromCache: false }, exists: () => false, data: () => undefined });
    await flushCallbacks();
    expect(harness.setState).not.toHaveBeenCalled();
    expect(harness.writeVerifiedOfflineSession).not.toHaveBeenCalled();
    expect(harness.signOut).not.toHaveBeenCalled();

    currentSnapshot(authz("B"));
    expect(harness.setState).toHaveBeenLastCalledWith(expect.objectContaining({
      status: "authenticated", session: expect.objectContaining({ uid: "B" }),
    }));
    cleanup();
    harness.setState.mockClear();
    currentSnapshot(authz("B"));
    expect(harness.setState).not.toHaveBeenCalled();
    expect(harness.writeVerifiedOfflineSession).toHaveBeenCalledTimes(1);
  });
});
