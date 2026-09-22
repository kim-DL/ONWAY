export const MAX_RECENT_CUSTOMERS = 20;
export const MAX_CUSTOMER_HOME_RECENTS = 5;

const customerIdPattern = /^[A-Za-z0-9_-]{1,128}$/;
const maximumStoredLength = 4096;
const emptyIds: readonly string[] = Object.freeze([]);

type RecentCustomerScope = {
  uid: string;
  claims: { sessionVersion: number; permissionsVersion: number };
};

type HistorySnapshot = { ready: boolean; ids: readonly string[] };
const initialSnapshot: HistorySnapshot = { ready: false, ids: emptyIds };

type HistoryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type RecentCustomerEnvironment = {
  getStorage: () => HistoryStorage | null;
  subscribeStorage: (key: string, onChange: () => void) => () => void;
};

export function recentCustomerStorageKey(session: RecentCustomerScope): string {
  return `onnuriway:private:recent-customers:v1:${encodeURIComponent(session.uid)}:${session.claims.sessionVersion}:${session.claims.permissionsVersion}`;
}

/** The wire format deliberately contains IDs only, never customer records or queries. */
export function parseRecentCustomerIds(raw: string | null): string[] {
  if (!raw || raw.length > maximumStoredLength) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.some((id) => typeof id !== "string" || !customerIdPattern.test(id))) return [];
    return [...new Set(value as string[])].slice(0, MAX_RECENT_CUSTOMERS);
  } catch {
    return [];
  }
}

export function resolveRecentCustomers<T extends { customerId: string }>(ids: readonly string[], customers: readonly T[]): T[] {
  const authorized = new Map(customers.map((customer) => [customer.customerId, customer]));
  return ids.flatMap((id) => {
    const customer = authorized.get(id);
    return customer ? [customer] : [];
  });
}

export function customerHomeRecents<T>(customers: readonly T[]): readonly T[] {
  return customers.slice(0, MAX_CUSTOMER_HOME_RECENTS);
}

const browserEnvironment: RecentCustomerEnvironment = {
  getStorage: () => typeof window === "undefined" ? null : window.localStorage,
  subscribeStorage: (key, onChange) => {
    if (typeof window === "undefined") return () => {};
    const listener = (event: StorageEvent) => {
      try {
        if (event.storageArea === window.localStorage && (event.key === key || event.key === null)) onChange();
      } catch {
        // Blocked browser storage must not interrupt the customer workflow.
      }
    };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  },
};

/** One mounted hook owns one store; no private history survives in a module cache. */
export function createRecentCustomerHistoryStore(key: string, environment = browserEnvironment) {
  let snapshot = initialSnapshot;
  let unsubscribeStorage: (() => void) | undefined;
  let memoryOnly = false;
  const listeners = new Set<() => void>();

  function publish(ids: readonly string[]) {
    if (snapshot.ready && ids.length === snapshot.ids.length && ids.every((id, index) => id === snapshot.ids[index])) return;
    snapshot = { ready: true, ids };
    listeners.forEach((listener) => listener());
  }

  function readIds(): readonly string[] {
    if (memoryOnly) return snapshot.ids;
    try {
      const storage = environment.getStorage();
      if (!storage) { memoryOnly = true; return snapshot.ids; }
      return parseRecentCustomerIds(storage.getItem(key));
    } catch {
      memoryOnly = true;
      return snapshot.ids;
    }
  }

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initialSnapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (listeners.size === 1) {
        memoryOnly = false;
        unsubscribeStorage = environment.subscribeStorage(key, () => {
          if (listeners.size) publish(readIds());
        });
        publish(readIds());
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          unsubscribeStorage?.();
          unsubscribeStorage = undefined;
          snapshot = initialSnapshot;
        }
      };
    },
    remember: (customerId: string, authorizedIds: ReadonlySet<string>) => {
      // Detached callbacks and guessed/non-authorized IDs cannot create history.
      if (!listeners.size || !customerIdPattern.test(customerId) || !authorizedIds.has(customerId)) return;
      const ids = [customerId, ...readIds().filter((id) => id !== customerId && authorizedIds.has(id))].slice(0, MAX_RECENT_CUSTOMERS);
      if (!memoryOnly) {
        try {
          const storage = environment.getStorage();
          if (storage) storage.setItem(key, JSON.stringify(ids));
          else memoryOnly = true;
        } catch {
          memoryOnly = true;
        }
      }
      publish(ids);
    },
    clear: () => {
      if (!listeners.size) return;
      try { environment.getStorage()?.removeItem(key); }
      catch { memoryOnly = true; }
      publish(emptyIds);
    },
  };
}
