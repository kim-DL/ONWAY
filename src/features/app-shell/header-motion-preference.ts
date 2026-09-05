"use client";

import { useSyncExternalStore } from "react";

export const HEADER_MOTION_STORAGE_KEY = "onnuriway:header-motion-paused:v1";
const CHANGE_EVENT = "onnuriway:header-motion-changed";
let memoryPaused = false;
let storageWriteFailed = false;

export function getHeaderMotionPaused(): boolean {
  if (typeof window === "undefined") return true;
  if (storageWriteFailed) return memoryPaused;
  try {
    const stored = window.localStorage.getItem(HEADER_MOTION_STORAGE_KEY);
    if (stored !== null) memoryPaused = stored === "true";
  } catch {
    // Private browsing/storage restrictions must not prevent a session pause.
  }
  return memoryPaused;
}

export function setHeaderMotionPaused(paused: boolean): void {
  memoryPaused = paused;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HEADER_MOTION_STORAGE_KEY, String(paused));
    storageWriteFailed = false;
  } catch {
    storageWriteFailed = true;
    // The in-memory preference still applies until this page is closed.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeToHeaderMotion(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== HEADER_MOTION_STORAGE_KEY && event.key !== null) return;
    memoryPaused = event.newValue === "true";
    storageWriteFailed = false;
    onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

// Pause until hydration so a stored stop preference never flashes motion.
const getServerSnapshot = () => true;

export function useHeaderMotionPreference() {
  const paused = useSyncExternalStore(subscribeToHeaderMotion, getHeaderMotionPaused, getServerSnapshot);
  return { paused, setPaused: setHeaderMotionPaused };
}
