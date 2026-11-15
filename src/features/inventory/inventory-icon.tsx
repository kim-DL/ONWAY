import type { ReactNode } from "react";

type InventoryIconName = "confirmed" | "pending" | "changed" | "receive" | "issue" | "adjust" | "edit" | "more";

// Inventory-only geometry keeps the status and stock actions in the same line style.
const paths: Readonly<Record<InventoryIconName, ReactNode>> = {
  confirmed: <><circle cx="12" cy="12" r="8.75" /><path d="m7.8 12.2 2.7 2.8 5.8-6" /></>,
  pending: <circle cx="12" cy="12" r="8.75" />,
  changed: <path d="M19.3 9A8 8 0 1 0 19 16.8M19.3 4.8V9h-4.2" />,
  receive: <path d="M12 3.75v11m-4-4 4 4 4-4M4.5 17v3.25h15V17" />,
  issue: <path d="M12 14.75v-11m-4 4 4-4 4 4M4.5 17v3.25h15V17" />,
  adjust: <><path d="M4 8h5m4 0h7M4 16h9m4 0h3" /><circle cx="11" cy="8" r="2" /><circle cx="15" cy="16" r="2" /></>,
  edit: <><path d="M12.5 4.5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6.5" /><path d="m17.5 3.5 3 3-9 9-4 1 1-4Z" /></>,
  more: <g fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></g>,
};

export function InventoryIcon({ name }: { name: InventoryIconName }) {
  return <svg aria-hidden="true" focusable="false" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
