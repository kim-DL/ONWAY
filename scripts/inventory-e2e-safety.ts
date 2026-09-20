/** Shared fail-closed boundary for local inventory UI tests and fixtures. */
export const INVENTORY_E2E_PROJECT = "demo-inventory-e2e";
export const INVENTORY_E2E_ORIGIN = "http://127.0.0.1:3103";
export function assertInventoryE2EEnvironment(environment = process.env) {
  const required: Record<string, string> = {
    INVENTORY_E2E: "true", FIREBASE_PROJECT_ID: INVENTORY_E2E_PROJECT,
    GCLOUD_PROJECT: INVENTORY_E2E_PROJECT, NEXT_PUBLIC_FIREBASE_PROJECT_ID: INVENTORY_E2E_PROJECT,
    NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "true", NEXT_PUBLIC_ENABLE_INVENTORY: "true",
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
    FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199", STORAGE_EMULATOR_HOST: "http://127.0.0.1:9199",
  };
  for (const [key, expected] of Object.entries(required)) {
    if (environment[key] !== expected) throw new Error(`Inventory E2E refused unsafe or missing ${key}.`);
  }
  if (environment.GOOGLE_APPLICATION_CREDENTIALS || environment.FIREBASE_TOKEN) throw new Error("Inventory E2E must not inherit production credentials.");
  if (environment.FIREBASE_CONFIG) {
    const config = JSON.parse(environment.FIREBASE_CONFIG) as { projectId?: string; storageBucket?: string };
    if (config.projectId !== INVENTORY_E2E_PROJECT || config.storageBucket !== `${INVENTORY_E2E_PROJECT}.appspot.com`) throw new Error("Inventory E2E refused a non-demo Firebase configuration.");
  }
}

/** Reconstruct independently started lists in request order (StrictMode may overlap them). */
export function groupInventoryE2EPageSequences<T extends { afterId: string | null; nextCursor: string | null }>(pages: T[]): T[][] {
  const available = new Set(pages.map((_, index) => index));
  const sequences: T[][] = [];
  for (const [rootIndex, root] of pages.entries()) {
    if (root.afterId !== null) continue;
    available.delete(rootIndex);
    const sequence = [root];
    const seen = new Set<string>();
    let cursor = root.nextCursor;
    let previousIndex = rootIndex;
    while (cursor !== null) {
      if (seen.has(cursor)) throw new Error("Inventory E2E page cursor repeated within one list.");
      seen.add(cursor);
      const nextIndex = pages.findIndex((page, index) => index > previousIndex && available.has(index) && page.afterId === cursor);
      if (nextIndex < 0) throw new Error("Inventory E2E list ended before its terminal page.");
      available.delete(nextIndex);
      const next = pages[nextIndex]!;
      sequence.push(next);
      cursor = next.nextCursor;
      previousIndex = nextIndex;
    }
    sequences.push(sequence);
  }
  if (!sequences.length || available.size) throw new Error("Inventory E2E list contains an orphan page.");
  return sequences;
}
