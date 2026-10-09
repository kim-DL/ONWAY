import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { getAdminFirestore } from "../shared/firebase-admin.js";
import { observeRead, observeWrite } from "../shared/read-observation.js";

export type Stored = { expiresAt: number; [key: string]: unknown };
export interface StoreTransaction {
  get<T extends Stored>(key: string): Promise<T | null>;
  set(key: string, value: Stored): void;
  delete(key: string): void;
}
export interface McpStore {
  get<T extends Stored>(key: string): Promise<T | null>;
  set(key: string, value: Stored): Promise<void>;
  transaction<T>(action: (tx: StoreTransaction) => Promise<T>): Promise<T>;
}
/** One private namespace. Never stores PINs or raw bearer/refresh/code secrets. */
export class FirestoreMcpStore implements McpStore {
  constructor(private readonly db: Firestore = getAdminFirestore()) {}
  private ref(key: string) { return this.db.collection("mcpPrivate").doc(key); }
  async get<T extends Stored>(key: string) { return (await observeRead("firestore", () => this.ref(key).get())).data() as T | undefined ?? null; }
  async set(key: string, value: Stored) { observeWrite(); await this.ref(key).set({ ...value, expiresAtTTL: Timestamp.fromMillis(value.expiresAt) }); }
  transaction<T>(action: (tx: StoreTransaction) => Promise<T>) {
    return this.db.runTransaction((tx) => action({
      get: async <V extends Stored>(key: string) => (await observeRead("firestore", () => tx.get(this.ref(key)))).data() as V | undefined ?? null,
      set: (key, value) => { observeWrite(); tx.set(this.ref(key), { ...value, expiresAtTTL: Timestamp.fromMillis(value.expiresAt) }); },
      delete: (key) => { observeWrite(); tx.delete(this.ref(key)); },
    }));
  }
}
