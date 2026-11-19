import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { forgetPrivateBlobUrl, registerPrivateBlobUrl } from "@/features/auth/private-client-state";
import { deliveryPhotoHistoryErrorMessage, deliveryPhotoHistoryRepository } from "../delivery-photo-history-repository";
import { deliveryPhotoDateKey } from "../delivery-photo-memory";
import { deliveryPhotoErrorKind } from "../delivery-photo-repository";

type Preview = { url: string } | { error: string };
type Listener = (value: Preview) => void;
type Entry = { listeners: Map<Listener, number>; result?: Preview; controller?: AbortController };

// One instance per authorized two-day window. Concurrent consumers share a single protected thumbnail.
export class GalleryThumbnails {
  private entries = new Map<string, Entry>();
  private running = 0;

  constructor(private session: AuthenticatedSession, private today: string, private onDenied: () => void) {}

  watch(id: string, priority: number, listener: Listener) {
    const entry: Entry = this.entries.get(id) ?? { listeners: new Map() };
    this.entries.delete(id);
    this.entries.set(id, entry);
    entry.listeners.set(listener, priority);
    if (entry.result) listener(entry.result);
    queueMicrotask(() => this.pump());
    return () => {
      entry.listeners.delete(listener);
      queueMicrotask(() => {
        if (this.entries.get(id) !== entry || entry.listeners.size) return;
        // A sent callable can be shared again if the user swipes back before it finishes.
        if (!entry.controller && (!entry.result || "error" in entry.result)) this.drop(id, entry);
        const unused = [...this.entries].filter(([, item]) => !item.listeners.size && item.result);
        for (const [key, item] of unused.slice(0, Math.max(0, unused.length - 6))) this.drop(key, item);
      });
    };
  }

  invalidate(id: string) {
    const entry = this.entries.get(id);
    if (!entry) return;
    if (entry.result && "url" in entry.result) forgetPrivateBlobUrl(entry.result.url);
    delete entry.result;
    this.pump();
  }

  clear() {
    for (const [id, entry] of this.entries) this.drop(id, entry);
  }

  private drop(id: string, entry: Entry) {
    this.entries.delete(id);
    entry.controller?.abort();
    if (entry.result && "url" in entry.result) forgetPrivateBlobUrl(entry.result.url);
  }

  private pump() {
    if (this.running >= 3 || deliveryPhotoDateKey() !== this.today) return;
    const priority = (entry: Entry) => Math.min(...entry.listeners.values());
    const queued = [...this.entries].filter(([, entry]) => entry.listeners.size && !entry.result && !entry.controller)
      .sort((a, b) => priority(a[1]) - priority(b[1]));
    for (const [id, entry] of queued.slice(0, 3 - this.running)) {
      const controller = new AbortController();
      entry.controller = controller;
      this.running++;
      const current = () => !controller.signal.aborted && this.entries.get(id) === entry && deliveryPhotoDateKey() === this.today;
      const wanted = () => current() && entry.listeners.size > 0;
      void deliveryPhotoHistoryRepository.load(id, "thumbnail", this.session, controller.signal, wanted).then((blob) => {
        if (wanted()) entry.result = { url: registerPrivateBlobUrl(URL.createObjectURL(blob)) };
      }).catch((error: unknown) => {
        if (!current()) return;
        if (deliveryPhotoErrorKind(error) === "auth") { this.clear(); this.onDenied(); return; }
        if (wanted() && !(error instanceof DOMException && error.name === "AbortError")) entry.result = { error: deliveryPhotoHistoryErrorMessage(error) };
      }).finally(() => {
        delete entry.controller;
        if (current() && entry.result) for (const listener of entry.listeners.keys()) listener(entry.result);
        if (this.entries.get(id) === entry && !entry.listeners.size && !entry.result) this.drop(id, entry);
        this.running--;
        this.pump();
      });
    }
  }
}
