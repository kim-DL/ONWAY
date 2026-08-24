import type { HTMLAttributes } from "react";

import { cn } from "./cn";

interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: "success" | "attention" | "neutral" | "info";
}

export function StatusBadge({ className, tone = "neutral", ...props }: StatusBadgeProps) {
  return <span className={cn("status-badge", `status-badge--${tone}`, className)} {...props} />;
}
