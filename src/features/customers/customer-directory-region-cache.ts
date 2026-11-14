import type { Customer, CustomerPoint, CustomerRegion } from "@/domain/customer";
import { registerPrivateClientCleanup } from "@/features/auth/private-client-cleanup-registry";

export type DirectoryRegionResult = { region: Pick<Customer, "district" | "administrativeDong"> | null; failed: boolean };
export type DirectoryRegionCandidate = { key: string; point: CustomerPoint };
type RegionLookup = (point: CustomerPoint) => Promise<CustomerRegion>;
type RegionListener = () => void;
type RegionSubscription = { candidates: readonly DirectoryRegionCandidate[]; lookup: RegionLookup; changed: RegionListener };
type RegionSession = {
  namespace: string;
  results: Map<string, DirectoryRegionResult>;
  inFlight: Map<string, symbol>;
  subscriptions: Set<RegionSubscription>;
  blocked: boolean;
  generation: number;
};

const CONCURRENCY = 3;
const activeRequests = new Set<symbol>();
let current: RegionSession | null = null;

export function clearCustomerDirectoryRegionCache(namespace?: string) {
  if (!current || namespace && current.namespace !== namespace) return;
  current.results.clear();
  current.inFlight.clear();
  current.subscriptions.clear();
  current = null;
}
registerPrivateClientCleanup(clearCustomerDirectoryRegionCache);

export function customerDirectoryRegionSession(namespace: string) {
  if (current?.namespace !== namespace) {
    clearCustomerDirectoryRegionCache();
    current = { namespace, results: new Map(), inFlight: new Map(), subscriptions: new Set(), blocked: false, generation: 0 };
  }
  return current;
}

function notify(session: RegionSession) {
  session.subscriptions.forEach(({ changed }) => changed());
}

function pump() {
  const session = current;
  if (!session || session.blocked) return;
  for (const subscription of session.subscriptions) {
    for (const candidate of subscription.candidates) {
      if (activeRequests.size >= CONCURRENCY) return;
      if (session.results.has(candidate.key) || session.inFlight.has(candidate.key)) continue;
      const request = Symbol();
      const generation = session.generation;
      session.inFlight.set(candidate.key, request);
      activeRequests.add(request);
      void Promise.resolve().then(() => {
        if (current !== session || generation !== session.generation || session.blocked || !session.subscriptions.size) return null;
        return subscription.lookup(candidate.point);
      }).then((response) => {
        if (current !== session || generation !== session.generation || session.blocked || !response) return;
        const region = { district: response.district.trim(), administrativeDong: response.administrativeDong.trim() };
        session.results.set(candidate.key, { region: region.district || region.administrativeDong ? region : null, failed: !region.administrativeDong });
        notify(session);
      }).catch((error: unknown) => {
        if (current !== session || generation !== session.generation || session.blocked) return;
        const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
        if (["permission-denied", "unauthenticated", "failed-precondition"].some((reason) => code.endsWith(reason))) {
          session.results.clear();
          session.inFlight.clear();
          session.generation += 1;
          session.blocked = true;
        } else session.results.set(candidate.key, { region: null, failed: true });
        notify(session);
      }).finally(() => {
        if (session.inFlight.get(candidate.key) === request) session.inFlight.delete(candidate.key);
        activeRequests.delete(request);
        // A request from a closed view or old session still occupies a network slot.
        pump();
      });
    }
  }
}

export function subscribeCustomerDirectoryRegions(session: RegionSession, candidates: readonly DirectoryRegionCandidate[], lookup: RegionLookup, changed: RegionListener) {
  const subscription = { candidates, lookup, changed };
  session.subscriptions.add(subscription);
  changed();
  pump();
  return () => { session.subscriptions.delete(subscription); };
}

export function retryCustomerDirectoryRegions(session: RegionSession) {
  if (current !== session) return;
  session.blocked = false;
  for (const [key, result] of session.results) if (result.failed) session.results.delete(key);
  notify(session);
  pump();
}
