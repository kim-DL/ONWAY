"use client";

import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";

import { Icon } from "./icon";

interface BottomSheetProps {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
}

export function BottomSheet({ open, title, description, children, onClose }: BottomSheetProps) {
  const titleId = useId();
  const descriptionId = useId();
  const historyId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const historyEntryRef = useRef(false);
  const previousHistoryStateRef = useRef<unknown>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const requestClose = useCallback(() => {
    if (historyEntryRef.current && window.history.state?.onnuriwaySheet === historyId) {
      window.history.back();
      return;
    }
    onCloseRef.current();
  }, [historyId]);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    previousHistoryStateRef.current = window.history.state;
    window.history.pushState({
      ...(typeof window.history.state === "object" && window.history.state ? window.history.state : {}),
      onnuriwaySheet: historyId,
    }, "", window.location.href);
    historyEntryRef.current = true;

    const closeFromHistory = (event: PopStateEvent) => {
      if (historyEntryRef.current && event.state?.onnuriwaySheet !== historyId) {
        historyEntryRef.current = false;
        onCloseRef.current();
      }
    };
    window.addEventListener("popstate", closeFromHistory);

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("popstate", closeFromHistory);
      window.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
      if (historyEntryRef.current && window.history.state?.onnuriwaySheet === historyId) {
        window.history.replaceState(previousHistoryStateRef.current, "", window.location.href);
        historyEntryRef.current = false;
      }
    };
  }, [historyId, open, requestClose]);

  if (!open) return null;

  return (
    <div
      className="bottom-sheet-layer"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) requestClose();
      }}
    >
      <section
        className="bottom-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <span className="bottom-sheet__handle" aria-hidden="true" />
        <button ref={closeRef} className="bottom-sheet__close" type="button" onClick={requestClose} aria-label="닫기">
          <Icon name="close" />
        </button>
        <header>
          <h2 id={titleId}>{title}</h2>
          {description ? <p id={descriptionId}>{description}</p> : null}
        </header>
        <div className="bottom-sheet__body">{children}</div>
      </section>
    </div>
  );
}
