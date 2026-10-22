"use client";

import { WelcomeGreeting } from "@/features/app-shell/welcome-greeting";
import { useTimeGreeting } from "@/features/app-shell/time-greeting";
import styles from "./inventory.module.css";

export function InventoryGreeting({ displayName }: { displayName: string }) {
  const greeting = useTimeGreeting();
  return <WelcomeGreeting variant="copy" className={styles.muted ?? ""}>
    {`${displayName}님, ${greeting}.`}
  </WelcomeGreeting>;
}
