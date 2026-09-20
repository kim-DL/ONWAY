"use client";

import type { ReactNode } from "react";

import { BottomSheet } from "@/components/ui/bottom-sheet";

import styles from "./admin-dialog.module.css";

/**
 * Keep administrator forms on the shared modal primitive: native inert/focus,
 * keyboard viewport sizing and owned PWA Back entries must behave identically.
 */
export function AdminDialog({ title, eyebrow, onClose, busy = false, children }: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
}) {
  const close = () => { if (!busy) onClose(); };
  return <BottomSheet open title={title} description={eyebrow} onClose={close}
    dismissible={!busy} beforeClose={() => !busy}>
    <div className={styles.content} aria-busy={busy} data-admin-dialog-content>
      {children}
    </div>
  </BottomSheet>;
}
