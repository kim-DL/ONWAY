import { Serwist } from "@serwist/window";
import { appRelease, releaseNotesRequest, type AppReleaseNotes } from "./release-notes";

export type UpdateNotice = { kind: "waiting" | "applying" | "installed"; notes: AppReleaseNotes | null };
const seenKey = "onnuriway.pwa.release";

function readNotes(worker: ServiceWorker): Promise<AppReleaseNotes | null> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const finish = (notes: AppReleaseNotes | null) => {
      clearTimeout(timeout);
      channel.port1.close();
      resolve(notes);
    };
    // Workers installed before release notes were introduced do not reply.
    const timeout = setTimeout(() => finish(null), 1500);
    channel.port1.onmessage = ({ data }) => {
      const valid = typeof data?.id === "string" && typeof data.date === "string"
        && Array.isArray(data.changes) && data.changes.every((item: AppReleaseNotes["changes"][number]) =>
          typeof item?.title === "string" && typeof item.text === "string");
      finish(valid ? data : null);
    };
    try { worker.postMessage(releaseNotesRequest, [channel.port2]); }
    catch { channel.port2.close(); finish(null); }
  });
}

function recordInstalledRelease(id: string, previouslyControlled: boolean) {
  try {
    const previous = localStorage.getItem(seenKey);
    localStorage.setItem(seenKey, id);
    return previous !== id && (previous !== null || previouslyControlled);
  } catch {
    // Storage can be unavailable in a private profile. The waiting notice still works.
    return false;
  }
}

export function registerAppUpdates(show: (notice: UpdateNotice | null) => void) {
  const workers = navigator.serviceWorker;
  const initialController = workers.controller;
  const serwist = new Serwist("/sw.js", { scope: "/", type: "classic", updateViaCache: "none" });
  let active = true;
  let registration: ServiceWorkerRegistration | undefined;
  let waiting: ServiceWorker | null = null;
  let accepted: ServiceWorker | null = null;
  let notes: AppReleaseNotes | null = null;
  let sawUpdate = false;

  serwist.addEventListener("waiting", ({ sw }) => {
    if (!active || !sw || sw === waiting) return;
    sawUpdate = true;
    waiting = sw;
    accepted = null;
    notes = null;
    show({ kind: "waiting", notes });
    void readNotes(sw).then((result) => {
      if (!active || waiting !== sw || accepted || !result) return;
      notes = result;
      show({ kind: "waiting", notes });
    });
  });

  const onControl = () => {
    if (accepted && workers.controller === accepted) {
      accepted = null;
      window.location.reload();
    } else if (waiting && workers.controller === waiting) {
      waiting = null;
      show(null);
    }
  };
  workers.addEventListener("controllerchange", onControl);
  void serwist.register({ immediate: true }).then(async (result) => {
    if (!active || !result) return;
    registration = result;
    const worker = initialController ?? (await workers.ready).active;
    if (!active || !worker) return;
    const installed = await readNotes(worker);
    if (!active || !installed || installed.id !== appRelease.id || (workers.controller && worker !== workers.controller)) return;
    if (recordInstalledRelease(installed.id, Boolean(initialController)) && !sawUpdate) show({ kind: "installed", notes: installed });
  }).catch(() => undefined);

  return {
    update: () => serwist.update(),
    apply() {
      if (!waiting || accepted) return;
      if (registration?.waiting !== waiting) { waiting = null; show(null); return; }
      accepted = waiting;
      show({ kind: "applying", notes });
      serwist.messageSkipWaiting();
    },
    dismiss() {
      if (accepted) return;
      waiting = null;
      show(null);
    },
    dispose() {
      active = false;
      workers.removeEventListener("controllerchange", onControl);
    },
  };
}
