import type { RegistrationOutcome, ScanField } from "@/domain/inventory-scan";
import { z } from "zod";
import { callInventory } from "../inventory-repository";
import { sameText } from "./review-model";

export function registrationMetrics(mode: RegistrationOutcome["mode"], started = Date.now()) {
  const first = new Map<ScanField, string>();
  const final = new Map<ScanField, string>();
  let sent = false;
  let photos = 0, analysisMs = 0, reviewStarted = 0, analysisAtReview = 0;
  let analysisStart: number | null = null, sequence = 0;
  function stopWaiting() {
    if (analysisStart !== null) analysisMs += Date.now() - analysisStart;
    analysisStart = null;
  }
  return {
    photographed: () => ++photos,
    analyze: () => {
      stopWaiting();
      const id = ++sequence;
      analysisStart = Date.now();
      return () => { if (sequence === id) stopWaiting(); };
    },
    stopWaiting,
    review: () => {
      stopWaiting();
      if (!reviewStarted) { reviewStarted = Date.now(); analysisAtReview = analysisMs; }
    },
    suggest: (field: ScanField, value: string, replaces?: string) => { if (!first.has(field) || first.get(field) === replaces) first.set(field, value); },
    reviewValues: (valueFor: (field: ScanField) => string) => { for (const field of first.keys()) final.set(field, valueFor(field)); },
    finish(outcome: RegistrationOutcome["outcome"]) {
      if (sent) return;
      sent = true; stopWaiting();
      const elapsed = (ms: number) => Math.min(86400, Math.max(0, Math.round(ms / 1000)));
      const suggested = [...first.keys()];
      void callInventory("recordInventoryRegistrationOutcome", { requestId: crypto.randomUUID(), mode, outcome,
        seconds: elapsed(Date.now() - started), analysisSeconds: elapsed(analysisMs),
        reviewSeconds: reviewStarted ? elapsed(Date.now() - reviewStarted - (analysisMs - analysisAtReview)) : 0, photos: Math.min(100, photos),
        suggested, corrected: outcome === "registered" ? suggested.filter(field => !sameText(first.get(field)!, final.get(field) ?? "")) : [],
      }, z.object({ recorded: z.boolean() })).catch(() => undefined);
    },
  };
}
export type RegistrationMetrics = ReturnType<typeof registrationMetrics>;
