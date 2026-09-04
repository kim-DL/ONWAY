"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { FirebaseError } from "firebase/app";
import {
  browserLocalPersistence,
  GoogleAuthProvider,
  onIdTokenChanged,
  setPersistence,
  signInWithPopup,
  signInWithCustomToken,
  signOut,
} from "firebase/auth";
import { doc, getDocFromServer, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import {
  authzMatchesSession,
  clientAuthzSchema,
  isVerifiedAdminSession,
  sessionClaimsSchema,
  type SessionClaims,
} from "@/domain/auth";
import {
  getFirebaseClientServices,
  type FirebaseClientServices,
} from "@/lib/firebase/client";
import { APP_METADATA } from "@/lib/app-metadata";
import { recordFirestoreReads } from "@/lib/performance/performance-monitor";
import {
  probeNetworkReachability,
  subscribeToNetworkRecovery,
} from "@/features/pwa/network-status";
import { readVerifiedOfflineSession, writeVerifiedOfflineSession } from "./offline-session";
import { clearPrivateClientState } from "./private-client-state";

export type AuthenticatedSession = {
  uid: string;
  displayName: string;
  claims: SessionClaims;
};

export type AuthState =
  | { status: "resolving" }
  | { status: "unconfigured" }
  | { status: "unauthenticated" }
  | { status: "invalid"; message: string }
  | { status: "authenticated"; session: AuthenticatedSession };

type AuthContextValue = {
  state: AuthState;
  login: (pin: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  dismissInvalidSession: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const UNCONFIGURED_AUTH_STATE: AuthState = { status: "unconfigured" };
const subscribeToClientAvailability = () => () => undefined;

function useIsClient() {
  return useSyncExternalStore(
    subscribeToClientAvailability,
    () => true,
    () => false,
  );
}

function loginMessage(error: unknown) {
  if (
    error instanceof FirebaseError &&
    error.code === "functions/resource-exhausted"
  ) {
    return "잠시 후 다시 시도해주세요.";
  }
  return "PIN을 확인해주세요.";
}

function adminLoginMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    if (error.code === "auth/popup-closed-by-user" || error.code === "auth/cancelled-popup-request") {
      return "Google 로그인이 취소되었습니다.";
    }
    if (error.code === "auth/popup-blocked") {
      return "브라우저의 팝업 차단을 해제한 뒤 다시 시도해주세요.";
    }
    if (error.code === "auth/unauthorized-domain") {
      return "현재 접속 주소는 Google 로그인 허용 도메인이 아닙니다.";
    }
    if (error.code === "functions/permission-denied") {
      return "관리자 허용목록과 역할을 확인해주세요.";
    }
  }
  return "관리자 로그인을 완료하지 못했습니다.";
}

async function settleWithin(promise: Promise<unknown>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      promise.catch(() => undefined),
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const isClient = useIsClient();
  const services: FirebaseClientServices | null | undefined = isClient
    ? getFirebaseClientServices()
    : undefined;
  const [state, setState] = useState<AuthState>({ status: "resolving" });
  const invalidReasonRef = useRef<string | null>(null);
  const adminActivationRef = useRef(false);

  useEffect(() => {
    if (!services) {
      return;
    }

    let active = true;
    let authUnsubscribe: Unsubscribe | undefined;
    let authzUnsubscribe: Unsubscribe | undefined;
    let onlineTokenRefreshCleanup: (() => void) | undefined;
    let authGeneration = 0;

    const invalidate = async (message: string) => {
      if (!active || invalidReasonRef.current) {
        return;
      }
      invalidReasonRef.current = message;
      authzUnsubscribe?.();
      authzUnsubscribe = undefined;
      onlineTokenRefreshCleanup?.();
      onlineTokenRefreshCleanup = undefined;
      await clearPrivateClientState();
      await signOut(services.auth).catch(() => undefined);
      if (active) {
        setState({ status: "invalid", message });
      }
    };

    const observeAuth = () => {
      // Persistence can settle after cleanup (including Strict Mode replay).
      // Never install a listener that the disposed effect cannot unsubscribe.
      if (!active) return;
      authUnsubscribe = onIdTokenChanged(services.auth, (user) => {
        if (!active) return;
        const generation = ++authGeneration;
        authzUnsubscribe?.();
        authzUnsubscribe = undefined;
        onlineTokenRefreshCleanup?.();
        onlineTokenRefreshCleanup = undefined;

        if (!user) {
          setState(
            invalidReasonRef.current
              ? { status: "invalid", message: invalidReasonRef.current }
              : { status: "unauthenticated" },
          );
          return;
        }

        const restoreVerifiedSessionOffline = (verifyWhenOnline: () => void) => {
          const offlineSession = readVerifiedOfflineSession(user.uid);
          if (!offlineSession || offlineSession.claims.roleScopes.includes("admin")) {
            return false;
          }

          invalidReasonRef.current = null;
          setState({ status: "authenticated", session: offlineSession });
          onlineTokenRefreshCleanup?.();
          onlineTokenRefreshCleanup = subscribeToNetworkRecovery(() => {
            onlineTokenRefreshCleanup = undefined;
            if (active && generation === authGeneration) verifyWhenOnline();
          });
          return true;
        };

        const resolveRemoteSession = (forceRefresh = false) => {
          void user
            .getIdTokenResult(forceRefresh)
            .then((token) => {
              if (!active || generation !== authGeneration) {
                return;
              }
              const firebaseClaim = token.claims.firebase as { sign_in_provider?: unknown } | undefined;
              const parsedClaims = sessionClaimsSchema.safeParse({
                ...token.claims,
                signInProvider: firebaseClaim?.sign_in_provider,
              });
              if (!parsedClaims.success) {
                if (adminActivationRef.current) return;
                return invalidate("로그인 정보가 올바르지 않습니다. 다시 로그인해주세요.");
              }
              if (
                parsedClaims.data.roleScopes.includes("admin")
                && !isVerifiedAdminSession(parsedClaims.data)
              ) {
                if (adminActivationRef.current) return;
                return invalidate("승인된 Google 관리자 로그인이 필요합니다.");
              }

              const cachedSession: AuthenticatedSession = {
                uid: user.uid,
                displayName: user.displayName ?? "급식길 직원",
                claims: parsedClaims.data,
              };
              const restoreCachedSessionOffline = () => restoreVerifiedSessionOffline(
                () => resolveRemoteSession(true),
              );
              const verifyAuthorization = () => {
                authzUnsubscribe?.();
                authzUnsubscribe = undefined;
                void probeNetworkReachability().then((reachable) => {
                  if (!active || generation !== authGeneration) return;
                  if (!reachable) {
                    restoreCachedSessionOffline();
                    return;
                  }

                  authzUnsubscribe = onSnapshot(
                    doc(services.firestore, "authz", user.uid),
                    (snapshot) => {
                      if (!active || generation !== authGeneration) return;
                      // Authorization is confirmed only by a server snapshot. A
                      // previously cached missing/stale document must never sign a
                      // freshly authenticated user out before Firestore reconnects.
                      if (snapshot.metadata.fromCache) return;
                      recordFirestoreReads("auth", 1);
                      const parsedAuthz = clientAuthzSchema.safeParse(snapshot.data());
                      if (
                        !snapshot.exists() ||
                        !parsedAuthz.success ||
                        !authzMatchesSession(parsedAuthz.data, parsedClaims.data)
                      ) {
                        void invalidate("세션이 변경되었습니다. 다시 로그인해주세요.");
                        return;
                      }

                      invalidReasonRef.current = null;
                      writeVerifiedOfflineSession(cachedSession);
                      setState({ status: "authenticated", session: cachedSession });
                    },
                    () => {
                      void probeNetworkReachability().then((stillReachable) => {
                        if (!active || generation !== authGeneration) return;
                        if (!stillReachable) {
                          restoreCachedSessionOffline();
                          return;
                        }
                        void invalidate("세션을 확인할 수 없습니다. 다시 로그인해주세요.");
                      });
                    },
                  );
                });
              };
              verifyAuthorization();
            })
            .catch(() => {
              void probeNetworkReachability().then((reachable) => {
                if (!active || generation !== authGeneration) return;
                if (!reachable && restoreVerifiedSessionOffline(
                  () => resolveRemoteSession(true),
                )) return;
                void invalidate("세션을 확인할 수 없습니다. 다시 로그인해주세요.");
              });
            });
        };

        // Firebase may keep getIdTokenResult() pending while requests are
        // blocked even when navigator.onLine is true. Probe a non-cached
        // endpoint first, restore only the last server-verified UID-bound
        // session offline, and perform token -> authz verification on recovery.
        setState((current) => current.status === "authenticated" && current.session.uid === user.uid
          ? current
          : { status: "resolving" });
        void probeNetworkReachability().then((reachable) => {
          if (!active || generation !== authGeneration) return;
          if (!reachable) {
            if (!restoreVerifiedSessionOffline(() => resolveRemoteSession(true))) {
              setState({
                status: "invalid",
                message: "인터넷에 연결한 뒤 다시 로그인해주세요.",
              });
            }
            return;
          }
          resolveRemoteSession();
        });
      });
    };

    void setPersistence(services.auth, browserLocalPersistence)
      .then(observeAuth)
      .catch(() => {
        if (active) {
          setState({
            status: "invalid",
            message: "이 브라우저에서 로그인 상태를 저장할 수 없습니다.",
          });
        }
      });

    return () => {
      active = false;
      authGeneration += 1;
      authUnsubscribe?.();
      authzUnsubscribe?.();
      onlineTokenRefreshCleanup?.();
    };
  }, [services]);

  const login = useCallback(
    async (pin: string) => {
      if (!services) {
        throw new Error("Firebase is not configured.");
      }

      invalidReasonRef.current = null;
      const employeeLogin = httpsCallable<
        { pin: string; appVersion: string },
        { customToken: string }
      >(services.functions, "employeeLogin");

      try {
        const response = await employeeLogin({ pin, appVersion: APP_METADATA.buildVersion });
        await setPersistence(services.auth, browserLocalPersistence);
        setState({ status: "resolving" });
        await signInWithCustomToken(services.auth, response.data.customToken);
      } catch (error) {
        setState({ status: "unauthenticated" });
        throw new Error(loginMessage(error));
      }
    },
    [services],
  );

  const loginWithGoogle = useCallback(async () => {
    if (!services) throw new Error("Firebase is not configured.");
    invalidReasonRef.current = null;
    adminActivationRef.current = true;
    setState({ status: "resolving" });
    try {
      // Open the popup before any awaited work so browsers preserve the click gesture.
      // Persistence is already initialized before the auth observer is attached above.
      const credential = await signInWithPopup(services.auth, new GoogleAuthProvider());
      const activateAdminSession = httpsCallable<
        { appVersion: string },
        { ok: boolean; employeeId: string; displayName: string }
      >(services.functions, "activateAdminSession");
      const activation = await activateAdminSession({ appVersion: APP_METADATA.buildVersion });
      // Establish the verified session directly after claim activation. Waiting
      // only for a second observer event can leave popup logins on the splash
      // screen because token refresh notifications may arrive while activation
      // is still guarded.
      const token = await credential.user.getIdTokenResult(true);
      const firebaseClaim = token.claims.firebase as { sign_in_provider?: unknown } | undefined;
      const parsedClaims = sessionClaimsSchema.safeParse({
        ...token.claims,
        signInProvider: firebaseClaim?.sign_in_provider,
      });
      if (!parsedClaims.success || !isVerifiedAdminSession(parsedClaims.data)) {
        throw new Error("Activated admin claims are unavailable.");
      }
      const authzSnapshot = await getDocFromServer(doc(services.firestore, "authz", credential.user.uid));
      const parsedAuthz = clientAuthzSchema.safeParse(authzSnapshot.data());
      if (!authzSnapshot.exists() || !parsedAuthz.success || !authzMatchesSession(parsedAuthz.data, parsedClaims.data)) {
        throw new Error("Activated admin authorization is unavailable.");
      }
      const session: AuthenticatedSession = {
        uid: credential.user.uid,
        displayName: activation.data.displayName || credential.user.displayName || "급식길 관리자",
        claims: parsedClaims.data,
      };
      recordFirestoreReads("auth", 1);
      writeVerifiedOfflineSession(session);
      adminActivationRef.current = false;
      setState({ status: "authenticated", session });
      // The refresh that delivered admin claims may have fired while the
      // activation guard was active. Refresh once more after the screen is
      // authenticated so the observer attaches its live authz revocation
      // listener without returning the UI to the loading state.
      void credential.user.getIdToken(true).catch(() => undefined);
    } catch (error) {
      adminActivationRef.current = false;
      await signOut(services.auth).catch(() => undefined);
      setState({ status: "unauthenticated" });
      throw new Error(adminLoginMessage(error));
    }
  }, [services]);

  const logout = useCallback(async () => {
    if (!services) {
      return;
    }

    const employeeLogout = httpsCallable<void, { ok: boolean }>(
      services.functions,
      "employeeLogout",
    );
    await settleWithin(employeeLogout(), 2_000);
    invalidReasonRef.current = null;
    await clearPrivateClientState();
    await signOut(services.auth);
    setState({ status: "unauthenticated" });
  }, [services]);

  const dismissInvalidSession = useCallback(() => {
    invalidReasonRef.current = null;
    setState({ status: "unauthenticated" });
  }, []);

  const visibleState: AuthState = services === null
    ? UNCONFIGURED_AUTH_STATE
    : state;
  const value = useMemo(
    () => ({ state: visibleState, login, loginWithGoogle, logout, dismissInvalidSession }),
    [dismissInvalidSession, login, loginWithGoogle, logout, visibleState],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be rendered inside AuthProvider.");
  }
  return value;
}
