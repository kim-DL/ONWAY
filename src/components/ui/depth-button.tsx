"use client";

import { cn } from "./cn";
import { DepthSurfaceButton, type DepthSurfaceButtonProps } from "./depth-surface-button";
import { Icon, type IconName } from "./icon";
import styles from "./depth-button-variants.module.css";

export interface DepthButtonProps extends Omit<DepthSurfaceButtonProps, "children" | "faceClassName"> {
  icon?: IconName;
  label: string;
  shape?: "circle" | "rectangle";
}

export function DepthButton({ icon, label, shape = "circle", className, ...props }: DepthButtonProps) {
  const rectangle = shape === "rectangle";
  return (
    <DepthSurfaceButton
      {...props}
      className={cn(styles.button, rectangle && styles.rectangle, className)}
      faceClassName={cn(icon && styles.withIcon, rectangle && styles.row)}
    >
      {icon && <Icon name={icon} className={styles.icon} focusable="false" />}
      <span className={styles.label}>{label}</span>
    </DepthSurfaceButton>
  );
}
