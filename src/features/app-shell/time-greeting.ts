"use client";

import { useSyncExternalStore } from "react";

const SERVER_GREETING = "반가워요";

export function greetingForHour(hour: number) {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new RangeError("Hour must be an integer between 0 and 23.");
  }
  if (hour < 11) return "좋은 아침이에요";
  if (hour < 17) return "힘찬 오후예요";
  return "오늘도 수고 많았어요";
}

export function greetingForNow(now = new Date()) {
  return greetingForHour(now.getHours());
}

function subscribeToClock(onChange: () => void) {
  const intervalId = window.setInterval(onChange, 60_000);
  window.addEventListener("focus", onChange);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    window.clearInterval(intervalId);
    window.removeEventListener("focus", onChange);
    document.removeEventListener("visibilitychange", onChange);
  };
}

export function useTimeGreeting() {
  return useSyncExternalStore(subscribeToClock, greetingForNow, () => SERVER_GREETING);
}
