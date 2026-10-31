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

function CeramicIcon({ name }: { name: "search" | "directory" | "register" | "camera" }) {
  return <span className={styles.ceramicIcon} data-icon={name} aria-hidden="true"
    style={{ backgroundImage: `url('/ui/customer-ceramic-${name}-v1.webp')` }} />;
}

/** A compact field-work entry point that leaves the recent list in view. */
export function CustomerHome({ greeting, onOpenSearch, onRegister, onOpenDirectory, onOpenDeliveryPhotos, registerDisabled = false, searchContent, searchTriggerRef }: CustomerHomeProps) {
  if (searchContent) return <header className={styles.searchHeader} data-customer-home data-customer-search-header>
    <h1 id="customer-heading" className={styles.srOnly}>거래처 검색</h1>
    {searchContent}
  </header>;

  return <header className={styles.hero} data-customer-home>
    <div className={styles.intro}>
      <WelcomeGreeting variant="customer" className={styles.greeting ?? ""} titleId="customer-heading" title="거래처 정보를" accent="한눈에.">
        {greeting}
      </WelcomeGreeting>
    </div>
    <div className={styles.actions} role="group" aria-label="거래처 빠른 메뉴">
      <button ref={searchTriggerRef} className={styles.action} type="button" onClick={onOpenSearch}>
        <CeramicIcon name="search" /><span>거래처 이름으로 찾기</span>
      </button>
      {onOpenDirectory ? <button className={styles.action} type="button" onClick={onOpenDirectory} disabled={registerDisabled}>
        <CeramicIcon name="directory" /><span>거래처 전체보기</span>
      </button> : null}
      {onOpenDeliveryPhotos ? <button className={styles.action} type="button" onClick={onOpenDeliveryPhotos}>
        <CeramicIcon name="camera" /><span>납품사진</span>
      </button> : null}
      {onRegister ? <button className={styles.action} type="button" onClick={onRegister} disabled={registerDisabled}>
        <CeramicIcon name="register" /><span>거래처 등록</span>
      </button> : null}
    </div>
  </header>;
}
