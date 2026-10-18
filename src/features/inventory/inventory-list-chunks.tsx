import type { ReactNode } from "react";
import styles from "./inventory.module.css";

/** Keep every row searchable/focusable; the browser skips offscreen groups.
 * Remember actual group heights after rendering, including variable-height rows.
 */
export function InventoryListChunks({ children }: { children: ReactNode[] }) {
  return <div role="list">{Array.from({ length: Math.ceil(children.length / 20) }, (_, index) => {
    const rows = children.slice(index * 20, (index + 1) * 20);
    return <ul key={index} role="presentation" className={styles.list} style={{
      // Keep the tail measured so a jump to the end cannot place the next
      // action below a subsequently expanded placeholder.
      contentVisibility: (index + 1) * 20 >= children.length ? "visible" : "auto", containIntrinsicBlockSize: `auto ${rows.length * 78}px`,
      borderTopWidth: index ? 0 : undefined,
    }}>{rows}</ul>;
  })}</div>;
}
