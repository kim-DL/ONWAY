"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { QuantumCloudLoader } from "@/components/ui/quantum-cloud-loader";
import { useHeaderMotionPreference } from "./header-motion-preference";
import styles from "./welcome-greeting.module.css";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const FORCED_COLORS = "(forced-colors: active)";

function isMotionRestricted() {
  return document.visibilityState !== "visible"
    || window.matchMedia(REDUCED_MOTION).matches
    || window.matchMedia(FORCED_COLORS).matches;
}

function subscribeToMotionEnvironment(onChange: () => void) {
  const queries = [window.matchMedia(REDUCED_MOTION), window.matchMedia(FORCED_COLORS)];
  queries.forEach((query) => query.addEventListener("change", onChange));
  document.addEventListener("visibilitychange", onChange);
  return () => {
    queries.forEach((query) => query.removeEventListener("change", onChange));
    document.removeEventListener("visibilitychange", onChange);
  };
}

// Never flash an animated frame before the saved/OS motion preference is known.
const serverMotionRestricted = () => true;

export function WelcomeGreeting({ children, title, accent, titleId, className = "" }: {
  children?: ReactNode;
  title: string;
  accent: string;
  titleId: string;
  className?: string;
}) {
  const mascotRef = useRef<HTMLSpanElement>(null);
  const { paused } = useHeaderMotionPreference();
  const restricted = useSyncExternalStore(subscribeToMotionEnvironment, isMotionRestricted, serverMotionRestricted);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const target = mascotRef.current;
    if (!target) return;
    if (typeof IntersectionObserver === "undefined") {
      const frame = requestAnimationFrame(() => setInView(true));
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver(([entry]) => {
      setInView(entry?.isIntersecting ?? false);
    }, { threshold: 0 });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const running = !paused && !restricted && inView;

  return (
    <div className={styles.greeting} data-welcome-greeting>
      <p className={`${className} ${styles.copy}`} data-greeting-copy>{children}</p>
      <div className={styles.headline} data-welcome-headline>
        <h1 id={titleId} className={styles.title} data-welcome-title>
          <span className={styles.leadRow} data-welcome-lead-row>
            <span className={styles.lead} data-welcome-title-lead>{title}</span>
            <span ref={mascotRef} className={styles.mascot} aria-hidden="true" data-welcome-mascot data-motion={running ? "running" : "paused"}>
              <QuantumCloudLoader paused={!running} />
            </span>
          </span>
          <em className={styles.accent} data-welcome-title-accent>{accent}</em>
        </h1>
      </div>
    </div>
  );
}
