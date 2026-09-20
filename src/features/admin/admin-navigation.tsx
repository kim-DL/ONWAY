"use client";

import { useEffect, useId, useState } from "react";

import { AppIconMark } from "@/components/ui/app-icon-mark";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Icon, type IconName } from "@/components/ui/icon";
import { INVENTORY_ENABLED } from "@/features/inventory/inventory-feature";
import styles from "./admin-navigation.module.css";

export type AdminView = "overview" | "customers" | "inventory" | "schools" | "employees" | "cycles"
  | "sync" | "export" | "audit" | "settings";
type NavigationGroup = "work" | "team" | "tools";

export const ADMIN_NAVIGATION: readonly {
  id: AdminView; label: string; hint: string; icon: IconName; group: NavigationGroup; mobileLabel?: string;
}[] = [
  { id: "overview", label: "운영 개요", hint: "오늘의 상태", icon: "home", group: "work", mobileLabel: "운영" },
  { id: "customers", label: "거래처 관리", hint: "납품 위치·연락처", icon: "location", group: "work", mobileLabel: "거래처" },
  { id: "schools", label: "학교 관리", hint: "기준정보·위치", icon: "building", group: "work", mobileLabel: "학교" },
  ...(INVENTORY_ENABLED ? [{ id: "inventory" as const, label: "재고 관리", hint: "품목·실사·입출고", icon: "clipboard" as const, group: "work" as const }] : []),
  { id: "employees", label: "직원 관리", hint: "로그인·권한", icon: "user", group: "team", mobileLabel: "직원" },
  { id: "cycles", label: "학교 배정", hint: "월별 담당·복사", icon: "calendar", group: "team" },
  { id: "sync", label: "데이터 동기화", hint: "학교·위치 정보", icon: "refresh", group: "tools" },
  { id: "export", label: "CSV", hint: "안전한 내보내기", icon: "download", group: "tools" },
  { id: "audit", label: "감사 기록", hint: "변경 추적", icon: "clipboard", group: "tools" },
  { id: "settings", label: "설정", hint: "앱 운영 정책", icon: "settings", group: "tools" },
];

const PRIMARY_ITEMS = ADMIN_NAVIGATION.filter((item) => item.mobileLabel);
const MORE_ITEMS = ADMIN_NAVIGATION.filter((item) => !item.mobileLabel);
const NAVIGATION_GROUPS = [
  { id: "work", label: "업무 관리" },
  { id: "team", label: "팀 관리" },
  { id: "tools", label: "운영 도구" },
].map((group) => ({ ...group, items: ADMIN_NAVIGATION.filter((item) => item.group === group.id) }));

export function AdminNavigation({ view, onNavigate, displayName, needsSyncReview = false }: {
  view: AdminView;
  onNavigate: (view: AdminView) => void;
  displayName: string;
  needsSyncReview?: boolean;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const selectedDescriptionId = useId();
  const selectedSecondary = MORE_ITEMS.find((item) => item.id === view);
  const secondarySelected = Boolean(selectedSecondary);

  useEffect(() => {
    if (!moreOpen) return;
    const desktop = window.matchMedia("(min-width: 821px)");
    const closeOnDesktop = () => { if (desktop.matches) setMoreOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, [moreOpen]);

  const navigate = (next: AdminView) => {
    setMoreOpen(false);
    onNavigate(next);
  };
  const reviewIndicator = <span className={styles.reviewDot} role="img" aria-label="검토 필요" />;

  return (
    <>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span><AppIconMark width={40} height={40} /></span>
          <div><strong>급식길</strong><small>온누리종합식품</small></div>
        </div>
        <nav aria-label="관리자 주요 메뉴">
          {NAVIGATION_GROUPS.map((group) => (
            <div className={styles.navGroup} role="group" aria-label={group.label} key={group.id}>
              <p className={styles.groupLabel} aria-hidden="true">{group.label}</p>
              {group.items.map((item) => (
                <button type="button" key={item.id} data-active={view === item.id}
                  aria-label={`${item.label} · ${item.hint}`} title={`${item.label} · ${item.hint}`}
                  aria-current={view === item.id ? "page" : undefined}
                  onClick={() => navigate(item.id)}>
                  <Icon name={item.icon} size={21} />
                  <strong className={styles.navLabel}>{item.label}</strong>
                  {item.id === "sync" && needsSyncReview ? reviewIndicator : null}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className={styles.account}>
          <span aria-hidden="true"><Icon name="user" size={18} /></span>
          <div><strong>{displayName}</strong><small>승인된 관리자</small></div>
        </div>
      </aside>

      <nav className={styles.mobileNav} aria-label="관리자 빠른 메뉴">
        {PRIMARY_ITEMS.map((item) => (
          <button type="button" key={item.id} data-active={view === item.id}
            aria-label={`${item.label} · ${item.hint}`}
            aria-current={view === item.id ? "page" : undefined}
            onClick={() => navigate(item.id)}>
            <span className={styles.mobileIcon}><Icon name={item.icon} size={22} /></span><span>{item.mobileLabel}</span>
          </button>
        ))}
        <button type="button" data-active={moreOpen || secondarySelected}
          aria-label="더보기" aria-haspopup="dialog" aria-expanded={moreOpen}
          aria-describedby={selectedSecondary ? selectedDescriptionId : undefined}
          title={needsSyncReview ? "데이터 동기화 검토 필요" : undefined}
          aria-current={secondarySelected ? "page" : undefined}
          onClick={() => setMoreOpen(true)}>
          <span className={styles.mobileIcon}><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
          </svg></span>
          <span>더보기</span>
          {needsSyncReview ? reviewIndicator : null}
        </button>
      </nav>
      {selectedSecondary ? <span className="sr-only" id={selectedDescriptionId}>{selectedSecondary.label} 선택됨</span> : null}

      <BottomSheet open={moreOpen} title="관리자 메뉴" onClose={() => setMoreOpen(false)}>
        <nav className={styles.moreMenu} aria-label="관리자 추가 메뉴">
          {MORE_ITEMS.map((item) => (
            <button type="button" key={item.id} data-active={view === item.id}
              aria-label={`${item.label} · ${item.hint}`}
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => navigate(item.id)}>
              <span className={styles.menuIcon}><Icon name={item.icon} size={21} /></span>
              <span className={styles.menuCopy}><strong>{item.label}</strong><small>{item.hint}</small></span>
              {item.id === "sync" && needsSyncReview ? reviewIndicator : null}
              <Icon name={view === item.id ? "check" : "chevron-right"} size={18} />
            </button>
          ))}
        </nav>
      </BottomSheet>
    </>
  );
}
