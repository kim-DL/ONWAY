"use client";

import { useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/ui/icon";
import type { School } from "@/domain/school";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import {
  createSchoolDetailSessionNamespace,
  schoolDetailRepository,
} from "@/features/school-detail/school-detail-repository";
import {
  readRecentSchoolEntries,
  type RecentSchoolEntry,
} from "@/features/search/search-catalog-cache";
import {
  createSearchSessionNamespace,
  searchCatalogRepository,
} from "@/features/search/search-catalog-repository";
import { useToast } from "@/components/ui/toast";

const DISTRICT_LABELS = {
  dong: "동구",
  jung: "중구",
  seo: "서구",
  yuseong: "유성구",
  daedeok: "대덕구",
} as const;

const SCHOOL_TYPE_LABELS = {
  elementary: "초등학교",
  middle: "중학교",
  high: "고등학교",
  special: "특수학교",
  other: "기타",
} as const;

function viewedLabel(viewedAt: number, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - viewedAt) / 60_000));
  if (minutes < 1) return "방금 봄";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}일 전`;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
  }).format(new Date(viewedAt));
}

export function DeliveryRecentSchools({
  session,
  onSelectSchool,
  onOpenSearch,
}: {
  session: AuthenticatedSession;
  onSelectSchool: (school: School) => void;
  onOpenSearch: () => void;
}) {
  const { showToast } = useToast();
  const sessionNamespace = useMemo(
    () => createSearchSessionNamespace(session, "delivery"),
    [session],
  );
  const [entries, setEntries] = useState<RecentSchoolEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void searchCatalogRepository.readCached(sessionNamespace)
      .then(async (catalog) => catalog
        ? readRecentSchoolEntries(catalog.catalogNamespace, catalog.items)
        : [])
      .then((recent) => {
        if (active) setEntries(recent.slice(0, 3));
      })
      .catch(() => {
        if (active) setEntries([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sessionNamespace]);

  const openRecentSchool = async (entry: RecentSchoolEntry) => {
    setResolvingId(entry.item.schoolId);
    try {
      const detailNamespace = createSchoolDetailSessionNamespace(session, "delivery");
      const cached = await schoolDetailRepository.readCached(detailNamespace, entry.item.schoolId);
      const school = cached?.detail.school ?? (navigator.onLine
        ? await searchCatalogRepository.getSchool(entry.item.schoolId)
        : null);
      if (!school) throw new Error("School detail is unavailable.");
      onSelectSchool(school);
    } catch {
      showToast(navigator.onLine
        ? "학교 상세정보를 불러오지 못했습니다."
        : "오프라인에서는 이전에 저장된 학교만 열 수 있습니다.");
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <section className="delivery-recents" aria-labelledby="delivery-recents-title">
      <header>
        <div>
          <h2 id="delivery-recents-title">최근 본 학교</h2>
        </div>
        <button type="button" onClick={onOpenSearch}>새 학교 찾기<Icon name="chevron-right" size={16} /></button>
      </header>

      {loading ? (
        <div className="delivery-recents__loading" role="status" aria-label="최근 학교 확인 중">
          <i /><i /><i />
        </div>
      ) : entries.length > 0 ? (
        <div className="delivery-recents__list">
          {entries.map((entry, index) => (
            <button
              key={entry.item.schoolId}
              type="button"
              disabled={resolvingId !== null}
              aria-label={`${entry.item.name} 다시 열기`}
              onClick={() => void openRecentSchool(entry)}
            >
              <span className="delivery-recents__index">0{index + 1}</span>
              <span className="delivery-recents__school">
                <strong>{entry.item.name}</strong>
                <small>{DISTRICT_LABELS[entry.item.district]} · {SCHOOL_TYPE_LABELS[entry.item.schoolType]}</small>
              </span>
              <span className="delivery-recents__time">{resolvingId === entry.item.schoolId ? "여는 중…" : viewedLabel(entry.viewedAt)}</span>
              <Icon name="chevron-right" size={17} />
            </button>
          ))}
        </div>
      ) : (
        <button className="delivery-recents__empty" type="button" onClick={onOpenSearch}>
          <span><Icon name="route" /></span>
          <span><strong>첫 학교를 열어보세요.</strong></span>
          <Icon name="chevron-right" />
        </button>
      )}
    </section>
  );
}
