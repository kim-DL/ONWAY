import type { HTMLAttributes } from "react";

import { cn } from "./cn";

interface SoftCardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: "default" | "accent" | "muted";
}

export function SoftCard({ className, tone = "default", ...props }: SoftCardProps) {
  return <div className={cn("soft-card", `soft-card--${tone}`, className)} {...props} />;
}
