import type { ReactNode } from "react";

export function FloatingContextBar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <aside className="floating-context-bar" aria-label={label}>
      {children}
    </aside>
  );
}
