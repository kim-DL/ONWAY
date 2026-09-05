import type { School } from "@/domain/school";
import { cn } from "@/components/ui/cn";

import styles from "./school-type-mark.module.css";

type SchoolType = School["schoolType"];

export const SCHOOL_TYPE_LABELS = {
  elementary: "초등학교",
  middle: "중학교",
  high: "고등학교",
  special: "특수학교",
  other: "기타 학교",
} as const satisfies Record<SchoolType, string>;

function SchoolTypeGlyph({ schoolType }: { schoolType: SchoolType }) {
  switch (schoolType) {
    case "elementary":
      return <><path d="M12 6.2C9.3 4.4 5.8 4 3 5v13.5c3-1 6.3-.6 9 1.3 2.7-1.9 6-2.3 9-1.3V5c-2.8-1-6.3-.6-9 1.2Z" /><path d="M12 6.2v13.6M6 8.5c1.1 0 2.1.3 3 .8M15 9.3c.9-.5 1.9-.8 3-.8" /></>;
    case "middle":
      return <><path d="M5 21V5l7-3 7 3v16M3 21h18M10 21v-5h4v5" /><path d="M8 7h1M15 7h1M8 11h1M15 11h1" /></>;
    case "high":
      return <><path d="m2 8.5 10-4.5 10 4.5L12 13 2 8.5Z" /><path d="M6 10.3V16c3.6 2.7 8.4 2.7 12 0v-5.7M22 8.5V16" /></>;
    case "special":
      return <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />;
    case "other":
      return <><path d="m3 10 9-6 9 6M5 9v11h14V9M10 20v-6h4v6" /><path d="M8 11h.01M16 11h.01" /></>;
  }
}

/** A non-interactive school-level identifier; the containing card owns the action. */
export function SchoolTypeMark({ schoolType, className }: { schoolType: SchoolType; className?: string }) {
  const type = Object.hasOwn(SCHOOL_TYPE_LABELS, schoolType) ? schoolType : "other";
  const label = SCHOOL_TYPE_LABELS[type];

  return (
    <span className={cn(styles.mark, styles[type], className)} role="img" aria-label={label} title={label} data-school-type={type}>
      <svg className={styles.glyph} viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <SchoolTypeGlyph schoolType={type} />
      </svg>
    </span>
  );
}
