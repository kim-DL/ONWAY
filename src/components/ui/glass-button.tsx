import type { ButtonHTMLAttributes } from "react";

import { cn } from "./cn";

interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "glass" | "primary" | "quiet" | "danger";
  compact?: boolean;
}

export function GlassButton({
  className,
  variant = "glass",
  compact = false,
  type = "button",
  ...props
}: GlassButtonProps) {
  return (
    <button
      className={cn("glass-button", `glass-button--${variant}`, compact && "glass-button--compact", className)}
      type={type}
      {...props}
    />
  );
}
