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
import dynamic from "next/dynamic";
import type { registerAppUpdates, UpdateNotice } from "./app-updates";

import { InitialStatusIcon } from "@/components/ui/initial-status-icon";
import {
  probeNetworkReachability,
  subscribeToNetworkRecovery,
} from "./network-status";

const UpdateNoticeCard = dynamic(() => import("./update-notice"), { ssr: false });

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
  const [notice, setNotice] = useState<UpdateNotice | null>(null);
  const installPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const updates = useRef<ReturnType<typeof registerAppUpdates> | null>(null);

  useEffect(() => {
    let active = true;
    let verification = 0;
    let recoveryCleanup: (() => void) | undefined;

    const verifyConnectivity = async () => {
      const currentVerification = ++verification;
      recoveryCleanup?.();
      recoveryCleanup = undefined;
      const reachable = await probeNetworkReachability();
      if (!active || currentVerification !== verification) return;
      setIsOnline(reachable);
      if (!reachable) {
        recoveryCleanup = subscribeToNetworkRecovery(() => {
          if (!active) return;
          setIsOnline(true);
          void updates.current?.update().catch(() => undefined);
        });
      }
    };
    const handleOffline = () => {
      if (!active) return;
      verification += 1;
      setIsOnline(false);
      recoveryCleanup?.();
      recoveryCleanup = subscribeToNetworkRecovery(() => {
        if (!active) return;
        setIsOnline(true);
        void updates.current?.update().catch(() => undefined);
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
      void updates.current?.update().catch(() => undefined);
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
    void import("./app-updates").then(({ registerAppUpdates }) => {
      if (active) updates.current = registerAppUpdates(setNotice);
    }).catch(() => undefined);
    return () => {
      active = false;
      updates.current?.dispose();
      updates.current = null;
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

  const installState: InstallState = standalone ? "installed" : installPrompt ? "available" : "unsupported";
  const value = useMemo(
    () => ({ installState, isOnline, install }),
    [install, installState, isOnline],
  );

  return (
    <PwaContext.Provider value={value}>
      {notice && <UpdateNoticeCard notice={notice} onApply={() => updates.current?.apply()} onDismiss={() => updates.current?.dismiss()} />}
      {children}
      {!isOnline ? (
        <div className="pwa-connectivity" role="status" data-testid="pwa-offline-status">
          <InitialStatusIcon name="wifi-off" size={18} />
          <span><strong>오프라인</strong> · 저장된 정보를 표시하고 있습니다.</span>
        </div>
      ) : null}
    </PwaContext.Provider>
  );
}

export function usePwa() {
  const value = useContext(PwaContext);
  if (!value) throw new Error("usePwa must be rendered inside PwaProvider.");
  return value;
}
