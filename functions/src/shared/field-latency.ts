import { AsyncLocalStorage } from "node:async_hooks";
import { logger } from "firebase-functions";
import type { Transaction } from "firebase-admin/firestore";

type Stage = "authorizationBefore" | "authorizationAfter" | "transaction" | "transactionAuthorization" | "receipt" | "countReads" | "countCompute" | "responseValidation";
export type FieldLatency = { operation: "inventory_count"; outcome: "ok" | "error"; totalMs: number;
  stagesMs: Partial<Record<Stage, number>>; transactionAttempts: number; readBatches: number; documentReads: number; documentWriteAttempts: number };
const context = new AsyncLocalStorage<FieldLatency>();
export function fieldTransactionAttempt() { const current = context.getStore(); if (current) current.transactionAttempts++; }
export async function fieldRead<T>(action: () => Promise<T>): Promise<T> {
  const current = context.getStore(); if (!current) return action();
  current.readBatches++;
  const result = await action();
  const count = Array.isArray(result) ? result.length : result && typeof result === "object" && "docs" in result && Array.isArray(result.docs) ? result.docs.length : 1;
  current.documentReads += count; return result;
}
export function fieldTransaction(transaction: Transaction): Transaction {
  if (!context.getStore()) return transaction;
  const proxy = new Proxy(transaction, { get(target, key) {
    const member: unknown = Reflect.get(target, key, target);
    if (typeof member !== "function") return member;
    return (...args: unknown[]) => {
      if (key === "get" || key === "getAll") return fieldRead(() => Reflect.apply(member, target, args));
      if (["create", "set", "update", "delete"].includes(String(key))) context.getStore()!.documentWriteAttempts++;
      const result: unknown = Reflect.apply(member, target, args); return result === target ? proxy : result;
    };
  } });
  return proxy;
}
export async function fieldStage<T>(stage: Stage, action: () => Promise<T>): Promise<T> {
  const current = context.getStore(); if (!current) return action();
  const started = performance.now();
  try { return await action(); } finally { current.stagesMs[stage] = (current.stagesMs[stage] ?? 0) + performance.now() - started; }
}
export function fieldCompute<T>(stage: Stage, action: () => T): T {
  const current = context.getStore(); if (!current) return action();
  const started = performance.now();
  try { return action(); } finally { current.stagesMs[stage] = (current.stagesMs[stage] ?? 0) + performance.now() - started; }
}
/** Fixed operation and stage names only: never accept a body, identity, path or error message. */
export async function observeFieldCount<T>(action: () => Promise<T>, emit: (result: FieldLatency) => void = (result) => logger.info("field_latency", result)) {
  const observation: FieldLatency = { operation: "inventory_count", outcome: "error", totalMs: 0, stagesMs: {}, transactionAttempts: 0, readBatches: 0, documentReads: 0, documentWriteAttempts: 0 };
  const started = performance.now();
  return context.run(observation, async () => {
    try { const result = await action(); observation.outcome = "ok"; return result; }
    finally {
      observation.totalMs = Math.round((performance.now() - started) * 10) / 10;
      for (const stage of Object.keys(observation.stagesMs) as Stage[]) observation.stagesMs[stage] = Math.round(observation.stagesMs[stage]! * 10) / 10;
      try { emit(observation); } catch { /* Telemetry must not change a committed command's outcome. */ }
    }
  });
}
