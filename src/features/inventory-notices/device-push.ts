import { httpsCallable } from "firebase/functions";
import { getFirebaseClientServices } from "@/lib/firebase/client";
import { readBinding, writeBinding } from "./device-binding";

export function pushAvailable() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}
export async function deviceEnabled(channel: string) {
  if (!pushAvailable() || Notification.permission !== "granted") return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await readBinding())?.channel === channel && Boolean(await reg?.pushManager.getSubscription());
}
export async function changeDevice(channel: string, enabled: boolean) {
  const services = getFirebaseClientServices();
  const uid = services?.auth.currentUser?.uid;
  if (!services || !uid) throw Error();
  if (enabled && (await Notification.requestPermission()) !== "granted") throw Error("permission");
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg?.active) throw Error("worker");
  const configure = httpsCallable(services.functions, "configureInventoryPush");
  let sub = await reg.pushManager.getSubscription();
  if (!enabled) {
    const binding = await readBinding();
    if (sub && binding)
      await configure({ action: "disable", channel, endpoint: sub.endpoint, binding: binding.id });
    await writeBinding(null);
    await sub?.unsubscribe().catch(() => false);
    return;
  }
  const { data } = await configure({ action: "key", channel });
  const key = (data as { publicKey: string }).publicKey;
  const bytes = Uint8Array.from(atob(key.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
  const binding = { channel, id: crypto.randomUUID() };
  if (services.auth.currentUser?.uid !== uid) throw Error();
  await configure({ action: "enable", channel, subscription: sub.toJSON(), binding: binding.id });
  if (services.auth.currentUser?.uid !== uid) throw Error();
  await writeBinding(binding);
}
