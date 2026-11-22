import { openDB } from "idb";

type Binding = { channel: string; id: string };
const store = "device";
async function database() {
  return openDB("onnuriway-inventory-push", 1, {
    upgrade(db) {
      db.createObjectStore(store);
    },
  });
}
export async function readBinding(): Promise<Binding | undefined> {
  const db = await database();
  try {
    return await db.get(store, "binding");
  } finally {
    db.close();
  }
}
export async function writeBinding(value: Binding | null) {
  const db = await database();
  try {
    const tx = db.transaction(store, "readwrite");
    if (value) await tx.store.put(value, "binding");
    else await tx.store.delete("binding");
    await tx.store.delete("recent");
    await tx.done;
  } finally {
    db.close();
  }
}

export async function clearDeviceOnLogout() {
  const binding = await readBinding();
  if (!binding) return;
  await writeBinding(null);
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return;
  const notices = await registration.getNotifications();
  for (const notice of notices) {
    if (notice.data?.binding === binding.id) notice.close();
  }
  await (await registration.pushManager.getSubscription())?.unsubscribe();
}

// Eventarc can retry a fan-out after another device fails. Claim the event on
// this installation before showing it, even if its previous banner was closed.
export async function claimPush(bindingId: string, noticeId: string, now = Date.now()) {
  const db = await database();
  try {
    const tx = db.transaction(store, "readwrite");
    const binding: Binding | undefined = await tx.store.get("binding");
    if (binding?.id !== bindingId) return false;
    const recent: [string, number][] = (await tx.store.get("recent")) ?? [];
    const active = recent.filter(([, time]) => now - time < 600_000);
    if (active.some(([id]) => id === noticeId)) return false;
    await tx.store.put([...active, [noticeId, now]], "recent");
    await tx.done;
    return true;
  } finally {
    db.close();
  }
}
