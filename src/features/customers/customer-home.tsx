"use client";

import type { ReactNode, Ref } from "react";

import { Icon } from "@/components/ui/icon";
import { WelcomeGreeting } from "@/features/app-shell/welcome-greeting";

import styles from "./customer-home.module.css";

export interface CustomerHomeProps {
  greeting: string;
  replayKey?: string | number;
  onOpenSearch: () => void;
  onRegister?: () => void;
  onOpenDirectory?: () => void;
  registerDisabled?: boolean;
  searchContent?: ReactNode;
  searchTriggerRef?: Ref<HTMLButtonElement>;
}

/** Shares the delivery home typography and search affordance, without a hero card. */
export function CustomerHome({ greeting, replayKey, onOpenSearch, onRegister, onOpenDirectory, registerDisabled = false, searchContent, searchTriggerRef }: CustomerHomeProps) {
  if (searchContent) return <header className={styles.searchHeader} data-customer-home data-customer-search-header>
    <h1 id="customer-heading" className={styles.srOnly}>거래처 검색</h1>
    {searchContent}
  </header>;

  return <header className={`shell-hero ${styles.hero}`} data-customer-home>
    <div>
      <p className="shell-kicker">DELIVERY · CUSTOMER</p>
      <WelcomeGreeting key={replayKey} className="shell-greeting" titleId="customer-heading"
        title="거래처 정보를" accent="한눈에.">
        {greeting}
      </WelcomeGreeting>
    </div>
    <div className={styles.actions}>
      <button ref={searchTriggerRef} className={`school-search-trigger ${styles.searchTrigger}`} type="button" onClick={onOpenSearch}>
        <span><Icon name="search" /><span><strong>거래처 이름으로 찾기</strong><small>거래처명 · 초성</small></span></span>
        <Icon name="chevron-right" />
      </button>
      <div className={styles.secondaryActions}>
      {onOpenDirectory ? <button className={styles.browse} type="button" onClick={onOpenDirectory} disabled={registerDisabled}>
        <Icon name="location" size={18} /><span>거래처 전체보기</span><Icon name="chevron-right" size={15} />
      </button> : null}
      {onRegister ? <button className={styles.register} type="button" onClick={onRegister} disabled={registerDisabled}>
        <Icon name="plus" size={18} /><span>거래처 등록</span>
      </button> : null}
      </div>
    </div>
  </header>;
}
