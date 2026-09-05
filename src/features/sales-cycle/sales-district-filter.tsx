"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { districtIndexForKey, type SalesDistrict, type SalesDistrictOption } from "./sales-district-filter-model";
import styles from "./sales-district-filter.module.css";

interface SalesDistrictFilterProps {
  options: readonly SalesDistrictOption[];
  value: SalesDistrict;
  onChange: (value: SalesDistrict) => void;
}

export function SalesDistrictFilter({ options, value, onChange }: SalesDistrictFilterProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef(new Map<SalesDistrict, HTMLButtonElement>());
  const [edges, setEdges] = useState({ overflow: false, previous: false, next: false });
  const optionsKey = options.map((option) => `${option.value}:${option.count}`).join("|");

  const measure = useCallback(() => {
    const root = rootRef.current;
    const track = trackRef.current;
    if (!root || !track) return;
    const rootStyle = getComputedStyle(root);
    const availableWidth = root.clientWidth - parseFloat(rootStyle.paddingLeft) - parseFloat(rootStyle.paddingRight);
    // Compare with the full rail, excluding optional arrows, so resize can remove them.
    const overflow = track.scrollWidth > availableWidth + 1;
    const nextEdges = {
      overflow,
      previous: overflow && track.scrollLeft > 1,
      next: overflow && track.scrollWidth - track.clientWidth - track.scrollLeft > 1,
    };
    setEdges((previous) => previous.overflow === nextEdges.overflow && previous.previous === nextEdges.previous && previous.next === nextEdges.next ? previous : nextEdges);
  }, []);

  const reveal = useCallback((button: HTMLButtonElement | undefined) => {
    const track = trackRef.current;
    if (!track || !button) return;
    const viewport = track.getBoundingClientRect();
    const target = button.getBoundingClientRect();
    // Scroll only this horizontal rail, never a containing page or bottom sheet.
    if (target.left < viewport.left + 2) track.scrollLeft += target.left - viewport.left - 2;
    else if (target.right > viewport.right - 2) track.scrollLeft += target.right - viewport.right + 2;
    // Update arrow availability in the same interaction, before a fast next key.
    measure();
  }, [measure]);

  useEffect(() => {
    const root = rootRef.current;
    const track = trackRef.current;
    if (!root || !track) return;
    const observer = new ResizeObserver(() => {
      measure();
      reveal(buttonRefs.current.get(value));
    });
    observer.observe(root);
    observer.observe(track);
    track.addEventListener("scroll", measure, { passive: true });
    const frame = requestAnimationFrame(measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      track.removeEventListener("scroll", measure);
    };
  }, [value, optionsKey, measure, reveal]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => reveal(buttonRefs.current.get(value)));
    return () => cancelAnimationFrame(frame);
  }, [value, optionsKey, edges.overflow, reveal]);

  function scroll(direction: number) {
    const track = trackRef.current;
    if (track) {
      track.scrollBy({ left: direction * Math.max(80, track.clientWidth * 0.75), behavior: "auto" });
      measure();
    }
  }

  return (
    <div ref={rootRef} className={styles.filter} data-overflow={edges.overflow}>
      {edges.overflow ? <button type="button" className={styles.scrollButton} disabled={!edges.previous} aria-label="이전 지역 보기" onClick={() => scroll(-1)}><Icon name="chevron-right" className={styles.previousIcon} size={18} /></button> : null}
      <div className={styles.viewport} data-previous={edges.previous} data-next={edges.next}>
        <div ref={trackRef} className={styles.track} role="radiogroup" aria-label="행정구 필터">
          {options.map((option, index) => (
            <button
              key={option.value}
              ref={(button) => { if (button) buttonRefs.current.set(option.value, button); else buttonRefs.current.delete(option.value); }}
              type="button"
              role="radio"
              aria-checked={value === option.value}
              aria-label={`${option.label}, ${option.count}곳`}
              tabIndex={value === option.value ? 0 : -1}
              className={styles.option}
              data-value={option.value}
              onClick={() => onChange(option.value)}
              onFocus={(event) => reveal(event.currentTarget)}
              onKeyDown={(event) => {
                const next = districtIndexForKey(event.key, index, options.length);
                if (next === null) return;
                event.preventDefault();
                const option = options[next];
                if (!option) return;
                onChange(option.value);
                buttonRefs.current.get(option.value)?.focus({ preventScroll: true });
              }}
            >
              <span>{option.label}</span><span className={styles.count} aria-hidden="true">{option.count}</span>
            </button>
          ))}
        </div>
      </div>
      {edges.overflow ? <button type="button" className={styles.scrollButton} disabled={!edges.next} aria-label="다음 지역 보기" onClick={() => scroll(1)}><Icon name="chevron-right" size={18} /></button> : null}
    </div>
  );
}
