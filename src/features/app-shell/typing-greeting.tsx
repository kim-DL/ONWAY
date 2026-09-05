"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import styles from "./typing-greeting.module.css";

const subscribeToHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
const segmenter = typeof Intl.Segmenter === "function"
  ? new Intl.Segmenter("ko", { granularity: "grapheme" }) : null;

export function splitGreeting(text: string): string[] {
  return segmenter ? Array.from(segmenter.segment(text), ({ segment }) => segment)
    : Array.from(text.normalize("NFC"));
}

/** A once-per-page entrance, not a live announcement or a repeating loader. */
export function TypingGreeting({ text, disabled, active }: {
  text: string;
  disabled: boolean;
  active: boolean;
}) {
  const ready = useSyncExternalStore(subscribeToHydration, clientReady, serverReady);
  const characters = useMemo(() => splitGreeting(text), [text]);
  const [revealed, setRevealed] = useState(0);
  const [complete, setComplete] = useState(false);
  const progress = useRef({ text: null as string | null, count: 0, started: false, finished: false });

  useEffect(() => {
    // The server's paused preference and fallback greeting are not a user choice.
    if (!ready) return;
    const current = progress.current;
    let timer: ReturnType<typeof setTimeout>;
    const changed = current.text !== null && current.text !== text;
    current.text = text;

    if (disabled || changed || current.finished || characters.length === 0) {
      current.finished = true;
      current.count = characters.length;
      timer = setTimeout(() => { setRevealed(characters.length); setComplete(true); }, 0);
    } else if (active) {
      // Local updates only: the surrounding cards and artwork do not rerender per letter.
      const stepMs = Math.min(42, 1800 / characters.length);
      const typeNext = () => {
        current.count += 1;
        setRevealed(current.count);
        if (current.count >= characters.length) {
          current.finished = true;
          setComplete(true);
        } else {
          timer = setTimeout(typeNext, stepMs);
        }
      };
      timer = setTimeout(typeNext, current.started ? stepMs : 180);
      current.started = true;
    }
    return () => clearTimeout(timer);
  }, [ready, disabled, active, text, characters.length]);

  const showAll = !ready || disabled || complete;
  const visibleCount = showAll ? characters.length : revealed;
  const typing = !showAll && visibleCount < characters.length;

  return (
    <>
      <span className={styles.accessible} data-greeting-accessible>{text}</span>
      <span className={styles.visual} aria-hidden="true" data-greeting-visual
        data-typing={typing ? (visibleCount === 0 ? "pending" : "typing") : "complete"}>
        {characters.map((character, index) => (
          <span key={index} className={styles.character} data-greeting-character
            data-cursor={typing && active && index === visibleCount - 1 && character.trim() ? "true" : undefined}
            style={{ visibility: index < visibleCount ? "visible" : "hidden" }}>{character}</span>
        ))}
      </span>
    </>
  );
}
