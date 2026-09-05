"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useHeaderMotionPreference } from "./header-motion-preference";
import styles from "./welcome-greeting.module.css";

const ANIMATION = "/brand/bloub-welcome-v2.webp";
const POSTER = "/brand/bloub-welcome-still-v2.png";
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

export function WelcomeGreeting({ children, title, className = "" }: {
  children?: ReactNode;
  title: ReactNode;
  className?: string;
}) {
  const mascotRef = useRef<HTMLSpanElement>(null);
  const { paused } = useHeaderMotionPreference();
  const restricted = useSyncExternalStore(subscribeToMotionEnvironment, isMotionRestricted, serverMotionRestricted);
  const [inView, setInView] = useState(false);
  const [animationFailed, setAnimationFailed] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);

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

  const running = !paused && !restricted && inView && !animationFailed;
  const source = running ? ANIMATION : POSTER;

  return (
    <div className={styles.greeting} data-welcome-greeting>
      <p className={`${className} ${styles.copy}`} data-greeting-copy>{children}</p>
      <div className={styles.headline} data-welcome-headline>
        <div className={styles.title} data-welcome-title>{title}</div>
        <span ref={mascotRef} className={styles.mascot} aria-hidden="true" data-welcome-mascot data-motion={running ? "running" : "paused"}>
          {/* Native animated WebP preserves all 200 frames/10 seconds. Replacing
              the source with a still stops decoded motion, unlike CSS animation-play-state. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- Already optimised, versioned animation + native still fallback. */}
          <img key={source} src={source} alt="" width={320} height={320} draggable={false} decoding="async"
            className={styles.image} hidden={!running && posterFailed}
            onError={() => { if (running) setAnimationFailed(true); else setPosterFailed(true); }} />
        </span>
      </div>
    </div>
  );
}
