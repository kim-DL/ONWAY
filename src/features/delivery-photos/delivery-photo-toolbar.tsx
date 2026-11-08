"use client";

import type { ReactNode } from "react";
import { SearchField } from "@/components/ui/search-field";
import { WelcomeGreeting } from "@/features/app-shell/welcome-greeting";
import { useTimeGreeting } from "@/features/app-shell/time-greeting";
import { splitGreeting } from "@/features/app-shell/typing-greeting";
import styles from "./toolbar.module.css";

export default function DeliveryPhotoToolbar({ displayName, summary, ready, hasToday, onEdit, query, onQueryChange, children }: {
  displayName: string;
  summary: string;
  ready: boolean;
  hasToday: boolean;
  onEdit: (mode: "route" | "day") => void;
  query: string;
  onQueryChange: (value: string) => void;
  children?: ReactNode;
}) {
  const greeting = useTimeGreeting();
  const nameLength = splitGreeting(displayName).length;
  const helloEnd = nameLength + splitGreeting("님 안녕하세요.").length;
  return <>
    <header className={styles.header}>
      <div className={styles.summary}><h1 id="delivery-photo-heading">납품사진</h1><strong>{summary}</strong></div>
      <div className={styles.welcome}><WelcomeGreeting variant="copy" className={styles.greetingCopy!}
        renderCharacters={(characters) => <>
          <span className={styles.hello}><span className={styles.welcomeName} title={displayName}>{characters.slice(0, nameLength)}</span><span className={styles.helloSuffix}>{characters.slice(nameLength, helloEnd)}</span></span>
          <span className={styles.welcomeMessage}>{characters.slice(helloEnd + 1)}</span>
        </>}>
        {`${displayName}님 안녕하세요.\n${greeting}.`}
      </WelcomeGreeting></div>
    </header>
    {children}
    {ready ? <div className={styles.manageActions} role="group" aria-label="납품처 관리">
      <button type="button" onClick={() => onEdit("route")}>내 납품처</button>
      <button type="button" onClick={() => onEdit("day")}>오늘 납품처</button>
      <button type="button" disabled={!hasToday} onClick={() => onEdit("day")}>순서 편집</button>
    </div> : null}
    <SearchField value={query} onChange={onQueryChange} label="납품사진 거래처 검색" placeholder="거래처 검색 · 초성" />
  </>;
}
