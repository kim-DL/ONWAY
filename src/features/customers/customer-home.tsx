"use client";

import type { ReactNode, Ref } from "react";

import { WelcomeGreeting } from "@/features/app-shell/welcome-greeting";

import styles from "./customer-home.module.css";

export interface CustomerHomeProps {
  greeting: string;
  onOpenSearch: () => void;
  onRegister?: () => void;
  onOpenDirectory?: () => void;
  onOpenDeliveryPhotos?: (() => void) | undefined;
  registerDisabled?: boolean;
  searchContent?: ReactNode;
  searchTriggerRef?: Ref<HTMLButtonElement>;
}

/** A compact field-work entry point that leaves the recent list in view. */
export function CustomerHome({ greeting, onOpenSearch, onRegister, onOpenDirectory, onOpenDeliveryPhotos, registerDisabled, searchContent, searchTriggerRef }: CustomerHomeProps) {
  if (searchContent) return <header className={styles.searchHeader} data-customer-home data-customer-search-header>
    <h1 id="customer-heading" className="sr-only">거래처 검색</h1>
    {searchContent}
  </header>;

  return <header className={styles.hero} data-customer-home>
    <div>
      <WelcomeGreeting variant="customer" className={styles.greeting!} titleId="customer-heading" title="거래처 정보를" accent="한눈에.">
        {greeting}
      </WelcomeGreeting>
    </div>
    <div className={styles.actions} role="group" aria-label="거래처 빠른 메뉴">
      {([
        ["search", "이름으로 찾기", onOpenSearch],
        ["directory", "전체보기", onOpenDirectory],
        ["camera", "납품사진", onOpenDeliveryPhotos],
        ["register", "거래처 등록", onRegister],
      ] as const).map(([name, label, onClick]) => onClick ? <button key={name}
        ref={name === "search" ? searchTriggerRef : undefined} className={styles.action} type="button" onClick={onClick}
        disabled={registerDisabled && (name === "directory" || name === "register")}>
        {/* These tiny, pre-sized static WebPs need no image transformation service. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.ceramicIcon} data-icon={name} alt="" width={48} height={48}
          src={`/ui/customer-ceramic-${name}-v1.webp`} /><span>{label}</span>
      </button> : null)}
    </div>
  </header>;
}
