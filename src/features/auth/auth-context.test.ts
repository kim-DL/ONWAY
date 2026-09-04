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
  signOut: harness.signOut, signInWithPopup: vi.fn(), signInWithCustomToken: vi.fn(),
}));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, collection: string, uid: string) => ({ collection, uid }),
  getDocFromServer: vi.fn(), onSnapshot: harness.onSnapshot,
}));
vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn() }));
vi.mock("@/lib/firebase/client", () => ({ getFirebaseClientServices: () => ({ auth: {}, firestore: {}, functions: {} }) }));
vi.mock("@/lib/performance/performance-monitor", () => ({ recordFirestoreReads: vi.fn() }));
vi.mock("@/features/pwa/network-status", () => ({
  probeNetworkReachability: async () => true, subscribeToNetworkRecovery: vi.fn(),
}));
vi.mock("./offline-session", () => ({
  readVerifiedOfflineSession: () => null, writeVerifiedOfflineSession: harness.writeVerifiedOfflineSession,
}));
vi.mock("./private-client-state", () => ({ clearPrivateClientState: async () => undefined }));

import { AuthProvider } from "./auth-context";

function mountObserver() {
  AuthProvider({ children: null });
  const cleanup = harness.effect?.();
  if (!cleanup) throw new Error("Expected an active auth effect");
  return cleanup;
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
  harness.signOut.mockResolvedValue(undefined);
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
