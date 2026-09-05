"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { QuantumCloudLoader } from "@/components/ui/quantum-cloud-loader";
import { useHeaderMotionPreference } from "./header-motion-preference";
import { TypingGreeting } from "./typing-greeting";
import styles from "./welcome-greeting.module.css";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const FORCED_COLORS = "(forced-colors: active)";

function getMotionEnvironment() {
  const hidden = document.visibilityState !== "visible";
  const reduced = window.matchMedia(REDUCED_MOTION).matches || window.matchMedia(FORCED_COLORS).matches;
  return (hidden ? 1 : 0) | (reduced ? 2 : 0);
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
const serverMotionRestricted = () => 3;

export function WelcomeGreeting({ children, title, accent, titleId, className = "" }: {
  children?: string;
  title: string;
  accent: string;
  titleId: string;
  className?: string;
}) {
  const mascotRef = useRef<HTMLSpanElement>(null);
  const copyRef = useRef<HTMLParagraphElement>(null);
  const { paused } = useHeaderMotionPreference();
  const environment = useSyncExternalStore(subscribeToMotionEnvironment, getMotionEnvironment, serverMotionRestricted);
  const [inView, setInView] = useState(false);
  const [copyInView, setCopyInView] = useState(false);

  useEffect(() => {
    const target = mascotRef.current;
    const copy = copyRef.current;
    if (!target || !copy) return;
    if (typeof IntersectionObserver === "undefined") {
      const frame = requestAnimationFrame(() => { setInView(true); setCopyInView(true); });
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === target) setInView(entry.isIntersecting);
        if (entry.target === copy) setCopyInView(entry.isIntersecting);
      }
    }, { threshold: 0 });
    observer.observe(target);
    observer.observe(copy);
    return () => observer.disconnect();
  }, []);

  const running = !paused && environment === 0 && inView;

  return (
    <div className={styles.greeting} data-welcome-greeting>
      <p ref={copyRef} className={`${className} ${styles.copy}`} data-greeting-copy>
        <TypingGreeting text={children ?? ""} disabled={paused || (environment & 2) !== 0} active={copyInView && (environment & 1) === 0} />
      </p>
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
