"use client";

import { useRef, type ComponentPropsWithRef, type PointerEvent, type ReactNode } from "react";

import { cn } from "./cn";
import styles from "./depth-button.module.css";

export interface DepthSurfaceButtonProps extends ComponentPropsWithRef<"button"> {
  children: ReactNode;
  faceClassName?: string;
}

export function DepthSurfaceButton({
  children,
  faceClassName,
  className,
  type = "button",
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onLostPointerCapture,
  ...props
}: DepthSurfaceButtonProps) {
  const touchPointerId = useRef<number | null>(null);

  function startTouchPress(event: PointerEvent<HTMLButtonElement>) {
    onPointerDown?.(event);
    if (event.pointerType === "touch" && event.isPrimary && !event.currentTarget.disabled && !event.defaultPrevented) {
      touchPointerId.current = event.pointerId;
      event.currentTarget.dataset.touchPressed = "";
    }
  }

  function endTouchPress(event: PointerEvent<HTMLButtonElement>) {
    if (event.pointerId === touchPointerId.current) {
      touchPointerId.current = null;
      delete event.currentTarget.dataset.touchPressed;
    }
  }

  return (
    <button
      {...props}
      className={cn(styles.button, className)}
      type={type}
      onPointerDown={startTouchPress}
      onPointerUp={(event) => {
        endTouchPress(event);
        onPointerUp?.(event);
      }}
      onPointerCancel={(event) => {
        endTouchPress(event);
        onPointerCancel?.(event);
      }}
      onLostPointerCapture={(event) => {
        endTouchPress(event);
        onLostPointerCapture?.(event);
      }}
    >
      <span className={styles.disc}>
        <span className={cn(styles.face, faceClassName)}>{children}</span>
      </span>
    </button>
  );
}
