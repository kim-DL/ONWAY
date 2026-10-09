import { AsyncLocalStorage } from "node:async_hooks";
import { HttpsError } from "firebase-functions/v2/https";

type ReadKind = "firestore" | "storage" | "firebaseAuth";
type Stage = ReadKind | "authorization" | "query" | "rateLimit";
export interface ReadObservation {
  milliseconds: Record<Stage, number>;
  operations: Record<ReadKind, number>;
  documentReads: number;
  documentWrites: number;
  storageBytes: number;
  cancelled?: boolean;
}
const context = new AsyncLocalStorage<ReadObservation>();
export function newReadObservation(): ReadObservation {
  return { milliseconds: { firestore: 0, storage: 0, firebaseAuth: 0, authorization: 0, query: 0, rateLimit: 0 },
    operations: { firestore: 0, storage: 0, firebaseAuth: 0 }, documentReads: 0, documentWrites: 0, storageBytes: 0 };
}
export function withReadObservation<T>(observation: ReadObservation, action: () => T): T { return context.run(observation, action); }
export async function measureStage<T>(stage: Stage, action: () => Promise<T>): Promise<T> {
  const observation = context.getStore();
  if (!observation) return action();
  const started = performance.now();
  try { return await action(); } finally { observation.milliseconds[stage] += performance.now() - started; }
}
/** Observes only counts/timings. Never retains a document, path, identity or image. */
export async function observeRead<T>(kind: ReadKind, action: () => Promise<T>, count: (value: T) => number = () => 1): Promise<T> {
  const observation = context.getStore();
  if (!observation) return action();
  if (observation.cancelled) throw new HttpsError("deadline-exceeded", "Read cancelled");
  observation.operations[kind]++;
  return measureStage(kind, async () => {
    const result = await action();
    if (kind === "firestore") observation.documentReads += count(result);
    if (kind === "storage") observation.storageBytes += count(result);
    return result;
  });
}
export function observeWrite() { const observation = context.getStore(); if (observation) observation.documentWrites++; }
export function cancelObservedReads() { const observation = context.getStore(); if (observation) observation.cancelled = true; }
