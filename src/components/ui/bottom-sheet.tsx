"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Icon } from "./icon";
import { lockBodyScroll } from "./body-scroll-lock";
import { customHistoryState } from "@/lib/browser-history";

interface BottomSheetProps {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  dismissible?: boolean;
  beforeClose?: () => boolean;
}

const ActionsContext = createContext<{
  host: HTMLDivElement | null;
  setBusy: (id: string, busy: boolean) => void;
  requestClose: () => void;
} | null>(null);

/** Child actions share the same guarded dismissal as Escape and the close button. */
export function useBottomSheetClose(): (() => void) | null {
  return useContext(ActionsContext)?.requestClose ?? null;
}

interface SheetHistoryEntry {
  id: string;
  active: boolean;
  ownsEntry: boolean;
  generation: number;
  ancestorIds: string[];
  state: Record<string, unknown>;
}

const sheetHistoryEntries = new Map<string, SheetHistoryEntry>();
let pendingSheetHistoryBack: Promise<void> | null = null;

function currentSheetHistoryEntry() {
  const id = window.history.state?.onnuriwaySheet;
  return typeof id === "string" ? sheetHistoryEntries.get(id) : undefined;
}

function acquireSheetHistory(entry: SheetHistoryEntry) {
  const current = currentSheetHistoryEntry();
  if (current === entry && entry.ownsEntry) return;
  const previousState = window.history.state;
  entry.state = {
    ...customHistoryState(previousState),
    onnuriwaySheet: entry.id,
  };
  if (current && !current.active && current.ownsEntry) {
    // A lazy placeholder or another sheet just unmounted. Reuse its slot rather
    // than leave a duplicate page behind or traverse past the replacement sheet.
    entry.ancestorIds = [...current.ancestorIds];
    current.ownsEntry = false;
    sheetHistoryEntries.delete(current.id);
    window.history.replaceState(customHistoryState(entry.state), "");
  } else {
    entry.ancestorIds = current?.active ? [...current.ancestorIds, current.id] : [];
    // This changes overlay state, not the URL. Passing even the unchanged URL
    // makes Next restore/refetch the route and can retire an open sheet's state.
    window.history.pushState(customHistoryState(entry.state), "");
  }
  entry.ownsEntry = true;
  sheetHistoryEntries.set(entry.id, entry);
}

function traverseSheetHistory(entry: SheetHistoryEntry) {
  if (pendingSheetHistoryBack || !entry.ownsEntry) return;
  let expectedId = entry.id;
  let complete!: () => void;
  pendingSheetHistoryBack = new Promise<void>((resolve) => { complete = resolve; });
  const finish = () => {
    window.removeEventListener("popstate", afterBack);
    pendingSheetHistoryBack = null;
    complete();
  };
  const consume = (released: SheetHistoryEntry) => {
    expectedId = released.id;
    if (!released.active) {
      released.ownsEntry = false;
      sheetHistoryEntries.delete(released.id);
    }
    window.history.back();
  };
  const afterBack = (event: PopStateEvent) => {
    if (event.state?.onnuriwaySheet === expectedId) return;
    const departed = sheetHistoryEntries.get(expectedId);
    if (departed && !departed.active && window.history.state?.onnuriwaySheet !== expectedId) {
      departed.ownsEntry = false;
      sheetHistoryEntries.delete(expectedId);
    }
    const previous = currentSheetHistoryEntry();
    if (previous && !previous.active && previous.ownsEntry) {
      // Nested sheets can unmount together. Skip only their known retired slots.
      consume(previous);
      return;
    }
    finish();
  };
  window.addEventListener("popstate", afterBack);
  consume(entry);
}

function consumeReleasedSheetHistory() {
  const entry = currentSheetHistoryEntry();
  if (entry && !entry.active && entry.ownsEntry) traverseSheetHistory(entry);
}

function activateSheetHistory(entry: SheetHistoryEntry) {
  entry.active = true;
  return ++entry.generation;
}

/** Keeps actions inside the dialog, outside scrolling content. Submit buttons need a form attribute. */
export function BottomSheetActions({ children, className = "", busy = false }: {
  children: ReactNode;
  className?: string;
  busy?: boolean;
}) {
  const context = useContext(ActionsContext);
  const id = useId();
  const setBusy = context?.setBusy;
  useEffect(() => {
    setBusy?.(id, busy);
    return () => setBusy?.(id, false);
  }, [busy, id, setBusy]);
  const actions = <div className={`bottom-sheet__actions ${className}`} aria-busy={busy || undefined}>{children}</div>;
  if (!context) return actions;
  return context.host ? createPortal(actions, context.host) : null;
}

export function BottomSheet({ open, title, description, children, onClose, dismissible = true, beforeClose }: BottomSheetProps) {
  const titleId = useId();
  const descriptionId = useId();
  const historyId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const beforeCloseRef = useRef(beforeClose);
  const dismissibleRef = useRef(dismissible);
  const busyActionsRef = useRef(new Set<string>());
  const historyEntryRef = useRef<SheetHistoryEntry | null>(null);
  const closingRef = useRef(false);
  const [actionsHost, setActionsHost] = useState<HTMLDivElement | null>(null);
  const [actionsBusy, setActionsBusy] = useState(false);
  const setBusy = useCallback((id: string, busy: boolean) => {
    if (busy) busyActionsRef.current.add(id);
    else busyActionsRef.current.delete(id);
    setActionsBusy(busyActionsRef.current.size > 0);
  }, []);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { beforeCloseRef.current = beforeClose; }, [beforeClose]);
  useEffect(() => { dismissibleRef.current = dismissible; }, [dismissible]);

  const requestClose = useCallback(() => {
    if (!dismissibleRef.current || busyActionsRef.current.size || closingRef.current) return;
    if (beforeCloseRef.current && !beforeCloseRef.current()) return;
    if (historyEntryRef.current?.ownsEntry && window.history.state?.onnuriwaySheet === historyId) {
      closingRef.current = true;
      traverseSheetHistory(historyEntryRef.current);
      return;
    }
    onCloseRef.current();
  }, [historyId]);
  const context = useMemo(() => ({ host: actionsHost, setBusy, requestClose }), [actionsHost, setBusy, requestClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const releaseScroll = lockBodyScroll();
    const entry = historyEntryRef.current ?? {
      id: historyId, active: false, ownsEntry: false, generation: 0, ancestorIds: [], state: {},
    };
    const generation = activateSheetHistory(entry);
    historyEntryRef.current = entry;
    const isCurrent = () => entry.active && entry.generation === generation;
    closingRef.current = false;
    dialog.showModal();
    closeRef.current?.focus({ preventScroll: true });
    const attachHistory = () => { if (isCurrent()) acquireSheetHistory(entry); };
    // A previous sheet's programmatic close may already be traversing history.
    // Wait for it before pushing this sheet, otherwise that Back would pop us.
    if (pendingSheetHistoryBack) void pendingSheetHistoryBack.then(attachHistory);
    else attachHistory();

    const closeFromHistory = (event: PopStateEvent) => {
      if (!isCurrent() || !entry.ownsEntry || event.state?.onnuriwaySheet === historyId) return;
      const destinationId = event.state?.onnuriwaySheet;
      const destination = typeof destinationId === "string" ? sheetHistoryEntries.get(destinationId) : undefined;
      // Back from a third-level photo viewer to its detail sheet must retain
      // the directory underneath. Only sheets above the destination close.
      if (destination?.active && destination.ancestorIds.includes(entry.id)) return;
      const alreadyConfirmed = closingRef.current;
      closingRef.current = false;
      if (!dismissibleRef.current || busyActionsRef.current.size
        || (!alreadyConfirmed && beforeCloseRef.current && !beforeCloseRef.current())) {
        // Retain a Back entry while saving or keeping an unsaved draft; the next
        // Back must still close only this sheet, not the page underneath it.
        window.history.pushState(customHistoryState(entry.state), "");
        return;
      }
      entry.ownsEntry = false;
      sheetHistoryEntries.delete(entry.id);
      onCloseRef.current();
    };
    const viewport = window.visualViewport;
    const fitViewport = () => {
      // Preserve pinch zoom; only fit the unzoomed keyboard viewport.
      const fit = viewport && Math.abs(viewport.scale - 1) < .01;
      dialog.style.setProperty("--sheet-viewport-height", `${fit ? viewport.height : window.innerHeight}px`);
      dialog.style.setProperty("--sheet-viewport-top", `${fit ? viewport.offsetTop : 0}px`);
    };
    fitViewport();
    viewport?.addEventListener("resize", fitViewport);
    viewport?.addEventListener("scroll", fitViewport);
    window.addEventListener("resize", fitViewport);
    window.addEventListener("popstate", closeFromHistory);

    return () => {
      entry.active = false;
      viewport?.removeEventListener("resize", fitViewport);
      viewport?.removeEventListener("scroll", fitViewport);
      window.removeEventListener("resize", fitViewport);
      window.removeEventListener("popstate", closeFromHistory);
      dialog.close();
      releaseScroll();
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
      // StrictMode immediately re-runs this effect; a lazy replacement may also
      // mount in this commit. Give either one a chance to reuse the owned slot.
      queueMicrotask(() => {
        if (entry.active || entry.generation !== generation || !entry.ownsEntry) return;
        consumeReleasedSheetHistory();
      });
    };
  }, [historyId, open]);

  if (!open) return null;
  return (
    <dialog
      ref={dialogRef}
      className="bottom-sheet-layer"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => { event.preventDefault(); event.stopPropagation(); requestClose(); }}
      onKeyDown={(event) => {
        if (event.key !== "Tab" || event.defaultPrevented) return;
        const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>(
          'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]',
        )].filter((element) => element.tabIndex >= 0 && !element.matches(":disabled")
          && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden");
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first && last) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        } else if (!event.shiftKey && document.activeElement === last && first) {
          event.preventDefault();
          first.focus({ preventScroll: true });
        }
      }}
      onMouseDown={(event) => { if (event.currentTarget === event.target) requestClose(); }}
    >
      <section className="bottom-sheet">
        <header className="bottom-sheet__header">
          <span className="bottom-sheet__handle" aria-hidden="true" />
          <button ref={closeRef} className="bottom-sheet__close" type="button" onClick={requestClose} disabled={!dismissible || actionsBusy} aria-label="닫기">
            <Icon name="close" />
          </button>
          <h2 id={titleId}>{title}</h2>
          {description ? <p id={descriptionId}>{description}</p> : null}
        </header>
        <ActionsContext.Provider value={context}>
          <div className="bottom-sheet__body">{children}</div>
          <div className="bottom-sheet__footer" ref={setActionsHost} />
        </ActionsContext.Provider>
      </section>
    </dialog>
  );
}
