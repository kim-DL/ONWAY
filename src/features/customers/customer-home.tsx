"use client";

import type { ReactNode, Ref } from "react";

import { Icon } from "@/components/ui/icon";

import styles from "./customer-home.module.css";

export interface CustomerHomeProps {
  greeting: string;
  onOpenSearch: () => void;
  onRegister?: () => void;
  onOpenDirectory?: () => void;
  registerDisabled?: boolean;
  searchContent?: ReactNode;
  searchTriggerRef?: Ref<HTMLButtonElement>;
}

/** A compact field-work entry point that leaves the recent list in view. */
export function CustomerHome({ greeting, onOpenSearch, onRegister, onOpenDirectory, registerDisabled = false, searchContent, searchTriggerRef }: CustomerHomeProps) {
  if (searchContent) return <header className={styles.searchHeader} data-customer-home data-customer-search-header>
    <h1 id="customer-heading" className={styles.srOnly}>거래처 검색</h1>
    {searchContent}
  </header>;

  return <header className={styles.hero} data-customer-home>
    <div className={styles.intro}>
      <p className={styles.greeting}>{greeting}</p>
      <h1 id="customer-heading">거래처 정보를 <span>한눈에.</span></h1>
    </div>
    <div className={styles.actions}>
      <button ref={searchTriggerRef} className={styles.searchTrigger} type="button" onClick={onOpenSearch}>
        <Icon name="search" size={20} /><span><strong>거래처 이름으로 찾기</strong><small>거래처명 · 초성</small></span>
        <Icon name="chevron-right" size={18} />
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
