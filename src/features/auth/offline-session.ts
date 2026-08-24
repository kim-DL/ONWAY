"use client";

import { z } from "zod";

import { sessionClaimsSchema, type SessionClaims } from "@/domain/auth";

const OFFLINE_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

const offlineSessionSchema = z.object({
  uid: z.string().min(1).max(256),
  displayName: z.string().trim().min(1).max(100),
  claims: sessionClaimsSchema,
  verifiedAt: z.number().int().nonnegative(),
}).strict();

export type OfflineSession = {
  uid: string;
  displayName: string;
  claims: SessionClaims;
};

function storageKey(uid: string) {
  return `onnuriway:private:v1:offline-session:${uid}`;
}

export function writeVerifiedOfflineSession(session: OfflineSession) {
  try {
    localStorage.setItem(storageKey(session.uid), JSON.stringify({ ...session, verifiedAt: Date.now() }));
  } catch {
    // Offline boot remains best effort in hardened/private browser modes.
  }
}

export function readVerifiedOfflineSession(uid: string): OfflineSession | null {
  try {
    const key = storageKey(uid);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = offlineSessionSchema.safeParse(JSON.parse(raw));
    if (
      !parsed.success
      || parsed.data.uid !== uid
      || Date.now() - parsed.data.verifiedAt > OFFLINE_SESSION_MAX_AGE_MS
    ) {
      localStorage.removeItem(key);
      return null;
    }
    return {
      uid: parsed.data.uid,
      displayName: parsed.data.displayName,
      claims: parsed.data.claims,
    };
  } catch {
    return null;
  }
}
