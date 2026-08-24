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
import type { Serwist as WindowSerwist } from "@serwist/window";

import { Icon } from "@/components/ui/icon";
import {
  probeNetworkReachability,
  subscribeToNetworkRecovery,
} from "./network-status";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

type InstallState = "unsupported" | "available" | "installed";

type PwaContextValue = {
  installState: InstallState;
  isOnline: boolean;
  install: () => Promise<void>;
};

const PwaContext = createContext<PwaContextValue | null>(null);

function getStandaloneSnapshot() {
  const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || standaloneNavigator.standalone === true;
}

function subscribeToStandalone(callback: () => void) {
  const media = window.matchMedia("(display-mode: standalone)");
  media.addEventListener("change", callback);
  window.addEventListener("appinstalled", callback);
  return () => {
    media.removeEventListener("change", callback);
    window.removeEventListener("appinstalled", callback);
  };
}

export function PwaProvider({ children }: { children: ReactNode }) {
  const standalone = useSyncExternalStore(subscribeToStandalone, getStandaloneSnapshot, () => false);
  const [isOnline, setIsOnline] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const installPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const serwistRef = useRef<WindowSerwist | null>(null);
  const acceptedUpdateRef = useRef(false);

  useEffect(() => {
    let active = true;
    let recoveryCleanup: (() => void) | undefined;

    const verifyConnectivity = async () => {
      recoveryCleanup?.();
      recoveryCleanup = undefined;
      const reachable = await probeNetworkReachability();
      if (!active) return;
      setIsOnline(reachable);
      if (!reachable) {
        recoveryCleanup = subscribeToNetworkRecovery(() => {
          if (!active) return;
          setIsOnline(true);
          void serwistRef.current?.update().catch(() => undefined);
        });
      }
    };
    const handleOffline = () => {
      if (!active) return;
      setIsOnline(false);
      recoveryCleanup?.();
      recoveryCleanup = subscribeToNetworkRecovery(() => {
        if (!active) return;
        setIsOnline(true);
        void serwistRef.current?.update().catch(() => undefined);
      });
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void verifyConnectivity();
    };

    void verifyConnectivity();
    window.addEventListener("online", verifyConnectivity);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("focus", verifyConnectivity);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      active = false;
      recoveryCleanup?.();
      window.removeEventListener("online", verifyConnectivity);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("focus", verifyConnectivity);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      void serwistRef.current?.update().catch(() => undefined);
    };
    const handleInstallPrompt = (event: Event) => {
      const promptEvent = event as BeforeInstallPromptEvent;
      promptEvent.preventDefault();
      installPromptRef.current = promptEvent;
      setInstallPrompt(promptEvent);
    };
    const handleInstalled = () => {
      installPromptRef.current = null;
      setInstallPrompt(null);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

    let active = true;
    void import("@serwist/window")
      .then(({ Serwist }) => {
        if (!active) return;
        const serwist = new Serwist("/sw.js", {
          scope: "/",
          type: "classic",
          updateViaCache: "none",
        });
        serwistRef.current = serwist;
        serwist.addEventListener("waiting", () => {
          if (active) setUpdateReady(true);
        });
        serwist.addEventListener("controlling", () => {
          if (active && acceptedUpdateRef.current) window.location.reload();
        });
        return serwist.register({ immediate: true });
      })
      .catch(() => undefined);

    return () => {
      active = false;
      serwistRef.current = null;
    };
  }, []);

  const install = useCallback(async () => {
    const prompt = installPromptRef.current;
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    installPromptRef.current = null;
    setInstallPrompt(null);
  }, []);

  const applyUpdate = useCallback(() => {
    if (!serwistRef.current) return;
    acceptedUpdateRef.current = true;
    setApplyingUpdate(true);
    serwistRef.current.messageSkipWaiting();
  }, []);

  const installState: InstallState = standalone ? "installed" : installPrompt ? "available" : "unsupported";
  const value = useMemo(
    () => ({ installState, isOnline, install }),
    [install, installState, isOnline],
  );

  return (
    <PwaContext.Provider value={value}>
      {children}
      {!isOnline ? (
        <div className="pwa-connectivity" role="status" data-testid="pwa-offline-status">
          <Icon name="wifi-off" size={18} />
          <span><strong>오프라인</strong> · 저장된 정보를 표시하고 있습니다.</span>
        </div>
      ) : null}
      {updateReady ? (
        <aside className="pwa-update" role="status" aria-live="polite" data-testid="pwa-update-ready">
          <span className="pwa-update__icon"><Icon name="refresh" size={20} /></span>
          <span><strong>새 버전이 준비되었습니다.</strong><small>입력 중인 내용은 자동으로 새로고침되지 않습니다.</small></span>
          <div>
            <button type="button" className="pwa-update__later" disabled={applyingUpdate} onClick={() => setUpdateReady(false)}>나중에</button>
            <button type="button" className="pwa-update__apply" disabled={applyingUpdate} onClick={applyUpdate}>{applyingUpdate ? "적용 중…" : "업데이트"}</button>
          </div>
        </aside>
      ) : null}
    </PwaContext.Provider>
  );
}

export function usePwa() {
  const value = useContext(PwaContext);
  if (!value) throw new Error("usePwa must be rendered inside PwaProvider.");
  return value;
}
