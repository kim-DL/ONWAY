import type { ButtonHTMLAttributes } from "react";

import { cn } from "./cn";

interface SmartChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
}

export function SmartChip({ className, selected = false, type = "button", ...props }: SmartChipProps) {
  return (
    <button
      className={cn("smart-chip", className)}
      type={type}
      aria-pressed={selected}
      {...props}
    />
  );
}
