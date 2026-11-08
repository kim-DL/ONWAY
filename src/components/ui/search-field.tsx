"use client";

import { useRef, type RefObject } from "react";
import { Icon } from "./icon";
import { searchInputProps } from "./search-input-props";
import styles from "./search-field.module.css";

export function SearchField({ value, onChange, label, placeholder, inputRef }: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const localRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? localRef;
  return <div className={styles.field}>
    <span className={styles.icon} aria-hidden="true"><Icon name="search-refined" size={22} strokeWidth={1.5} /></span>
    <input ref={ref} {...searchInputProps} className={styles.input} aria-label={label} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
    {value ? <button type="button" className={styles.clear} aria-label="검색어 지우기" onClick={() => { onChange(""); ref.current?.focus(); }}><Icon name="close" size={16} /></button> : null}
    <span aria-hidden="true" className={styles.sheen} />
  </div>;
}
