"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { BottomSheet, useBottomSheetClose } from "@/components/ui/bottom-sheet";
import { Icon } from "@/components/ui/icon";
import styles from "./inventory-form-design.module.css";

const DAY = 86_400_000;
const MIN_DATE = "0001-01-01";
const MAX_DATE = "9999-12-31";
const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
export function formatInventoryDateInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, 8).replace(/^(\d{4})(\d)/, "$1-$2").replace(/^(\d{4}-\d{2})(\d)/, "$1-$2");
}
export function isInventoryInputDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < MIN_DATE) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
function utc(value: string) { return new Date(`${value}T00:00:00.000Z`); }
function boundedDate(date: Date): string {
  return new Date(Math.min(utc(MAX_DATE).valueOf(), Math.max(utc(MIN_DATE).valueOf(), date.valueOf()))).toISOString().slice(0, 10);
}
export function shiftInventoryDate(value: string, days: number): string { return boundedDate(new Date(utc(value).valueOf() + days * DAY)); }
export function shiftInventoryMonth(value: string, months: number): string {
  const date = utc(value); const day = date.getUTCDate();
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + months);
  const end = new Date(date); end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(0);
  date.setUTCDate(Math.min(day, end.getUTCDate()));
  return boundedDate(date);
}
export function inventoryCalendarDays(value: string): Array<string | null> {
  const first = `${value.slice(0, 7)}-01`;
  const end = utc(first); end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(0);
  const offset = utc(first).getUTCDay();
  return Array.from({ length: Math.ceil((offset + end.getUTCDate()) / 7) * 7 }, (_, index) => {
    const day = index - offset + 1;
    return day < 1 || day > end.getUTCDate() ? null : `${value.slice(0, 7)}-${String(day).padStart(2, "0")}`;
  });
}
function todayInKorea() { return new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10); }

function DateCalendar({ initial, selected, onSelect }: { initial: string; selected: string; onSelect: (date: string) => void }) {
  const close = useBottomSheetClose();
  const [focused, setFocused] = useState(initial);
  const grid = useRef<HTMLTableElement>(null);
  const heading = useId(); const help = useId();
  const focusDay = useRef(true);
  useEffect(() => {
    if (!focusDay.current) return;
    const frame = requestAnimationFrame(() => { grid.current?.querySelector<HTMLButtonElement>(`button[data-date="${focused}"]`)?.focus({ preventScroll: true }); focusDay.current = false; });
    return () => cancelAnimationFrame(frame);
  }, [focused]);
  function move(value: string, focus: boolean) { focusDay.current = focus; setFocused(value); }
  function key(event: KeyboardEvent<HTMLButtonElement>) {
    let next: string | undefined;
    if (event.key === "ArrowLeft") next = shiftInventoryDate(focused, -1);
    if (event.key === "ArrowRight") next = shiftInventoryDate(focused, 1);
    if (event.key === "ArrowUp") next = shiftInventoryDate(focused, -7);
    if (event.key === "ArrowDown") next = shiftInventoryDate(focused, 7);
    if (event.key === "Home") next = shiftInventoryDate(focused, -utc(focused).getUTCDay());
    if (event.key === "End") next = shiftInventoryDate(focused, 6 - utc(focused).getUTCDay());
    if (event.key === "PageUp") next = shiftInventoryMonth(focused, event.shiftKey ? -12 : -1);
    if (event.key === "PageDown") next = shiftInventoryMonth(focused, event.shiftKey ? 12 : 1);
    if (next) { event.preventDefault(); event.stopPropagation(); move(next, true); }
  }
  const days = inventoryCalendarDays(focused);
  const monthLabel = `${Number(focused.slice(0, 4))}년 ${Number(focused.slice(5, 7))}월`;
  return <div className={styles.calendar}>
    <div className={styles.calendarNavigation}>
      <button type="button" aria-label="이전 해" disabled={focused.slice(0, 4) === "0001"} onClick={() => move(shiftInventoryMonth(focused, -12), false)}>«</button>
      <button type="button" aria-label="이전 달" disabled={focused.startsWith("0001-01")} onClick={() => move(shiftInventoryMonth(focused, -1), false)}>‹</button>
      <strong id={heading} aria-live="polite">{monthLabel}</strong>
      <button type="button" aria-label="다음 달" disabled={focused.startsWith("9999-12")} onClick={() => move(shiftInventoryMonth(focused, 1), false)}>›</button>
      <button type="button" aria-label="다음 해" disabled={focused.slice(0, 4) === "9999"} onClick={() => move(shiftInventoryMonth(focused, 12), false)}>»</button>
    </div>
    <table ref={grid} role="grid" aria-labelledby={heading} aria-describedby={help} className={styles.calendarGrid}>
      <thead><tr>{weekdays.map((day) => <th key={day} scope="col" abbr={`${day}요일`}>{day}</th>)}</tr></thead>
      <tbody>{Array.from({ length: days.length / 7 }, (_, week) => <tr key={week}>{days.slice(week * 7, week * 7 + 7).map((date, index) => <td key={date ?? `blank-${index}`} aria-selected={date === selected || undefined}>{date ? <button type="button" data-date={date} aria-label={`${Number(date.slice(0, 4))}년 ${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일`} aria-current={date === todayInKorea() ? "date" : undefined} tabIndex={date === focused ? 0 : -1} onFocus={() => { if (focused !== date) move(date, false); }} onKeyDown={key} onClick={() => { onSelect(date); close?.(); }}>{Number(date.slice(8))}</button> : null}</td>)}</tr>)}</tbody>
    </table>
    <p id={help} className={styles.calendarHelp}>방향키로 날짜 이동 · Page Up/Down으로 월 이동</p>
  </div>;
}

/** Direct ISO-date typing plus a real, keyboard-accessible calendar on every browser. */
export function InventoryDateField({ label, value, onChange, disabled = false }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const id = useId(); const input = useRef<HTMLInputElement>(null);
  const [calendarDate, setCalendarDate] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const invalid = !!value && !isInventoryInputDate(value);
  useEffect(() => { input.current?.setCustomValidity(invalid ? "YYYY-MM-DD 형식의 실제 날짜를 입력해주세요." : ""); }, [invalid]);
  return <div className={styles.dateField}>
    <label htmlFor={id}>{label}</label>
    <div className={styles.dateInputRow}>
      <input ref={input} id={id} type="text" inputMode="numeric" autoComplete="off" required maxLength={10} pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" placeholder="YYYY-MM-DD" value={value} disabled={disabled} aria-invalid={touched && invalid} aria-describedby={`${id}-format${touched && invalid ? ` ${id}-error` : ""}`} onBlur={() => setTouched(true)} onChange={(event) => onChange(formatInventoryDateInput(event.target.value))} />
      <button type="button" className={styles.calendarTrigger} aria-label={`${label} 달력 열기${isInventoryInputDate(value) ? `, ${value}` : ""}`} aria-haspopup="dialog" aria-expanded={calendarDate !== null} disabled={disabled} onClick={() => setCalendarDate(isInventoryInputDate(value) ? value : todayInKorea())}><Icon name="calendar" size={21} /></button>
    </div>
    <span className={styles.srOnly} id={`${id}-format`}>날짜 형식: YYYY-MM-DD</span>
    {touched && invalid ? <span className={styles.dateError} id={`${id}-error`}>실제 날짜를 YYYY-MM-DD로 입력해주세요.</span> : null}
    {calendarDate !== null ? <BottomSheet open title={`${label} 선택`} onClose={() => setCalendarDate(null)}><DateCalendar initial={calendarDate} selected={value} onSelect={(date) => { onChange(date); setTouched(false); }} /></BottomSheet> : null}
  </div>;
}
