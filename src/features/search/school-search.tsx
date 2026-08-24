"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { GlassButton } from "@/components/ui/glass-button";
import { Icon } from "@/components/ui/icon";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import type { SchoolSearchItem } from "@/domain/catalog";
import type { School } from "@/domain/school";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { recordPerformanceMetric } from "@/lib/performance/performance-monitor";
import {
  createSchoolDetailSessionNamespace,
  schoolDetailRepository,
} from "@/features/school-detail/school-detail-repository";
import { MemorySearchIndex, type SchoolSearchResult } from "./memory-search-index";
import {
  searchCatalogRepository,
  type SearchRoleScope,
} from "./search-catalog-repository";
import { useSchoolSearchCatalog } from "./use-school-search-catalog";

const DISTRICT_LABELS: Record<SchoolSearchItem["district"], string> = {
  dong: "동구",
  jung: "중구",
  seo: "서구",
  yuseong: "유성구",
  daedeok: "대덕구",
};

const SCHOOL_TYPE_LABELS: Record<SchoolSearchItem["schoolType"], string> = {
  elementary: "초등학교",
  middle: "중학교",
  high: "고등학교",
  special: "특수학교",
  other: "기타",
};

const MATCH_LABELS: Record<SchoolSearchResult["matchType"], string> = {
  officialExact: "학교명 일치",
  shortExact: "축약명 일치",
  aliasExact: "이전 이름 일치",
  officialPrefix: "학교명 시작",
  shortPrefix: "축약명 시작",
  aliasPrefix: "별칭 시작",
  initialsPrefix: "초성 일치",
  contains: "학교명 포함",
  initialsContains: "초성 포함",
  fuzzy: "오타 후보",
};

function ResultButton({
  item,
  matchType,
  active,
  onSelect,
}: {
  item: SchoolSearchItem;
  matchType?: SchoolSearchResult["matchType"] | undefined;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      id={`school-search-option-${item.schoolId}`}
      className="school-search-result"
      type="button"
      role="option"
      aria-selected={active}
      onClick={onSelect}
    >
      <span className="school-search-result__mark"><Icon name="building" /></span>
      <span className="school-search-result__body">
        <span className="school-search-result__name">
          <strong>{item.name}</strong>
          {matchType ? <small>{MATCH_LABELS[matchType]}</small> : null}
        </span>
        <span className="school-search-result__meta">
          {DISTRICT_LABELS[item.district]} · {SCHOOL_TYPE_LABELS[item.schoolType]}
          {item.addressSummary ? ` · ${item.addressSummary}` : ""}
        </span>
        <span className="school-search-result__signals">
          <span data-active={item.fieldInfoAvailable}>현장정보 {item.fieldInfoAvailable ? "있음" : "준비 중"}</span>
          <span data-active={item.photoCount > 0}>사진 {item.photoCount}</span>
        </span>
      </span>
      <Icon name="chevron-right" size={20} />
    </button>
  );
}

export function SchoolSearch({
  open,
  session,
  roleScope,
  onClose,
  onSchoolResolved,
}: {
  open: boolean;
  session: AuthenticatedSession;
  roleScope: SearchRoleScope;
  onClose: () => void;
  onSchoolResolved: (school: School) => void;
}) {
  const { showToast } = useToast();
  const catalogState = useSchoolSearchCatalog(session, roleScope);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SchoolSearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [resolvingSchoolId, setResolvingSchoolId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const catalog = catalogState.status === "ready" ? catalogState.catalog : null;
  const index = useMemo(() => new MemorySearchIndex(catalog?.items ?? []), [catalog]);
  const displayedItems = query.trim().length > 0
    ? searchResults.map((result) => ({ item: result.item, matchType: result.matchType }))
    : catalogState.recentSchools.map((item) => ({ item, matchType: undefined }));
  const closeSearch = useCallback(() => {
    setQuery("");
    setSearchResults([]);
    setActiveIndex(0);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSearch();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [closeSearch, open]);

  if (!open) return null;

  const selectItem = async (item: SchoolSearchItem) => {
    setResolvingSchoolId(item.schoolId);
    try {
      void catalogState.addRecentSchool(item);
      const detailNamespace = createSchoolDetailSessionNamespace(session, roleScope);
      const cachedSchool = async () => (
        await schoolDetailRepository.readCached(detailNamespace, item.schoolId)
      )?.detail.school ?? null;
      const cached = await cachedSchool();
      const school = cached ?? (navigator.onLine
        ? await searchCatalogRepository.getSchool(item.schoolId)
        : null);
      if (!school) throw new Error("School is not cached for offline use.");
      onSchoolResolved(school);
      closeSearch();
    } catch {
      showToast(navigator.onLine
        ? "학교 검색 결과는 저장되어 있지만 상세정보를 불러오지 못했습니다."
        : "오프라인에서는 이전에 열어본 학교의 상세정보만 볼 수 있습니다.");
    } finally {
      setResolvingSchoolId(null);
    }
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && displayedItems.length > 0) {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % displayedItems.length);
    } else if (event.key === "ArrowUp" && displayedItems.length > 0) {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + displayedItems.length) % displayedItems.length);
    } else if (event.key === "Enter") {
      const selected = displayedItems[activeIndex];
      if (selected) {
        event.preventDefault();
        void selectItem(selected.item);
      }
    }
  };

  const activeItem = displayedItems[activeIndex]?.item;
  const resultMessage = query.trim().length > 0
    ? `${searchResults.length}개의 학교 검색 결과`
    : `${catalogState.recentSchools.length}개의 최근 학교`;

  return (
    <div className="school-search-layer" role="dialog" aria-modal="true" aria-labelledby="school-search-title">
      <button className="school-search-backdrop" type="button" aria-label="학교 검색 닫기" onClick={closeSearch} />
      <section className="school-search-panel">
        <header className="school-search-header">
          <div>
            <p>LOCAL SCHOOL INDEX</p>
            <h2 id="school-search-title">어느 학교로 갈까요?</h2>
          </div>
          <button className="school-search-close" type="button" aria-label="학교 검색 닫기" onClick={closeSearch}>
            <Icon name="close" />
          </button>
        </header>

        <div className="school-search-field">
          <Icon name="search" size={23} />
          <input
            ref={inputRef}
            role="combobox"
            aria-label="학교명 검색"
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls="school-search-results"
            aria-activedescendant={activeItem ? `school-search-option-${activeItem.schoolId}` : undefined}
            autoComplete="off"
            disabled={catalogState.status === "loading"}
            placeholder="학교명 · 축약명 · 초성"
            value={query}
            onChange={(event) => {
              const nextQuery = event.target.value;
              const startedAt = performance.now();
              const nextResults = index.search(nextQuery, 10);
              if (nextQuery.trim()) recordPerformanceMetric("searchDuration", startedAt, "memory");
              setQuery(nextQuery);
              setSearchResults(nextResults);
              setActiveIndex(0);
            }}
            onKeyDown={onInputKeyDown}
          />
          {query ? (
            <button type="button" aria-label="검색어 지우기" onClick={() => { setQuery(""); setSearchResults([]); setActiveIndex(0); }}>
              <Icon name="close" size={18} />
            </button>
          ) : <kbd>⌘ K</kbd>}
        </div>

        <div className="school-search-summary">
          <div>
            <span>{query.trim() ? "검색 결과" : "최근 학교"}</span>
            {catalogState.status === "ready" ? (
              <small>카탈로그 v{catalogState.catalog.version} · {catalogState.catalog.items.length}개 학교</small>
            ) : null}
          </div>
          {catalogState.status === "ready" ? (
            <StatusBadge tone={catalogState.stale ? "attention" : catalogState.refreshing ? "info" : "success"}>
              {catalogState.stale ? "오프라인 카탈로그" : catalogState.refreshing ? "최신 버전 확인 중" : "로컬 검색 준비됨"}
            </StatusBadge>
          ) : null}
        </div>
        <p className="sr-only" aria-live="polite">{resultMessage}</p>

        <div id="school-search-results" className="school-search-results" role="listbox" aria-label="학교 검색 결과">
          {catalogState.status === "loading" ? (
            <div className="school-search-state" aria-label="검색 카탈로그 불러오는 중">
              <span className="search-pulse" aria-hidden="true" />
              <strong>이 기기의 학교 지도를 준비하고 있어요.</strong>
              <p>저장된 카탈로그를 먼저 확인한 뒤 최신 버전을 살펴봅니다.</p>
            </div>
          ) : catalogState.status === "error" ? (
            <div className="school-search-state" role="alert">
              <span><Icon name="building" /></span>
              <strong>학교 카탈로그를 불러오지 못했어요.</strong>
              <p>처음 사용하는 기기라면 인터넷 연결이 필요합니다.</p>
              <GlassButton compact onClick={catalogState.retry}>다시 불러오기</GlassButton>
            </div>
          ) : displayedItems.length > 0 ? displayedItems.map(({ item, matchType }, itemIndex) => (
            <ResultButton
              key={item.schoolId}
              item={item}
              matchType={matchType}
              active={activeIndex === itemIndex}
              onSelect={() => {
                if (resolvingSchoolId === null) void selectItem(item);
              }}
            />
          )) : query.trim() ? (
            <div className="school-search-state">
              <span><Icon name="search" /></span>
              <strong>검색 결과가 없습니다.</strong>
              <p>학교명을 다시 확인해주세요. 외부 API를 자동으로 호출하지 않습니다.</p>
            </div>
          ) : (
            <div className="school-search-state school-search-state--guide">
              <span><Icon name="sparkles" /></span>
              <strong>학교명, 줄임말, 초성으로 바로 찾아보세요.</strong>
              <p><b>둔산초</b> 또는 <b>ㄷㅈㄷㅅㅊ</b>처럼 입력해도 네트워크 요청 없이 찾습니다.</p>
            </div>
          )}
        </div>

        <footer className="school-search-footer">
          <span><i aria-hidden="true" />입력 중 Firestore · NEIS · Kakao 요청 0</span>
          <span>↑↓ 이동 · Enter 선택 · Esc 닫기</span>
        </footer>
      </section>
    </div>
  );
}
