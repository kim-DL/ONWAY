"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { GlassButton } from "@/components/ui/glass-button";
import { Icon } from "@/components/ui/icon";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useToast } from "@/components/ui/toast";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import {
  type CsvExportFilter,
  type CsvExportOptions,
  type CsvExportPreview,
  type CsvExportResult,
  type CsvExportSelection,
} from "./csv-export-contract";
import { csvExportErrorMessage, csvExportRepository, saveBase64File } from "./csv-export-repository";

const KIND_OPTIONS = [{ value: "assignments", label: "월별 배정" }, { value: "visits", label: "방문 이력" }] as const;
const SCOPE_OPTIONS = [
  { value: "own", label: "내 담당" },
  { value: "team", label: "팀 전체" },
  { value: "admin", label: "전체 관리 범위" },
] as const;
const DISTRICTS = [{ value: "", label: "전체 행정구" }, { value: "dong", label: "동구" }, { value: "jung", label: "중구" }, { value: "seo", label: "서구" }, { value: "yuseong", label: "유성구" }, { value: "daedeok", label: "대덕구" }] as const;
const SCHOOL_TYPES = [{ value: "", label: "전체 학교급" }, { value: "elementary", label: "초등학교" }, { value: "middle", label: "중학교" }, { value: "high", label: "고등학교" }, { value: "special", label: "특수학교" }, { value: "other", label: "기타" }] as const;
const MONTHLY_STATUSES = [{ value: "", label: "전체 방문 상태" }, { value: "before", label: "방문 전" }, { value: "completed", label: "방문 완료" }, { value: "followUp", label: "후속 필요" }, { value: "revisit", label: "재방문" }, { value: "onHold", label: "보류" }] as const;
const INTEREST_SCORES = [{ value: "", label: "전체 관심도" }, ...[0, 20, 40, 60, 80, 100].map((value) => ({ value: String(value), label: value === 0 ? "관심도 0 · 미평가 포함" : `관심도 ${value}` }))];

const emptyFilter: CsvExportFilter = {
  cycleId: null, zoneId: null, assigneeId: null, district: null, schoolType: null, monthlyStatus: null,
  interestScore: null, followUpOnly: false, tagId: null, visitedFrom: null, visitedTo: null,
};

function subscribeNetwork(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => { window.removeEventListener("online", listener); window.removeEventListener("offline", listener); };
}

function formatExpiry(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function SalesExportWorkspace({ session }: { session: AuthenticatedSession }) {
  const { showToast } = useToast();
  const online = useSyncExternalStore(subscribeNetwork, () => navigator.onLine, () => true);
  const isAdmin = session.claims.roleScopes.includes("admin");
  const [options, setOptions] = useState<CsvExportOptions | null>(null);
  const [selection, setSelection] = useState<CsvExportSelection>({
    kind: "assignments",
    scope: isAdmin ? "admin" : "own",
    filter: emptyFilter,
  });
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">("loading");
  const [previewStatus, setPreviewStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [preview, setPreview] = useState<CsvExportPreview | null>(null);
  const [previewKey, setPreviewKey] = useState("");
  const [generated, setGenerated] = useState<CsvExportResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const selectionKey = useMemo(() => JSON.stringify(selection), [selection]);
  const currentPreview = previewStatus === "ready" && previewKey === selectionKey ? preview : null;

  useEffect(() => {
    let active = true;
    csvExportRepository.loadOptions().then((loaded) => {
      if (!active) return;
      setOptions(loaded);
      setSelection((current) => ({ ...current, filter: { ...current.filter, cycleId: loaded.currentCycleId } }));
      setPreviewStatus("loading");
      setLoadStatus("ready");
    }).catch(() => { if (active) setLoadStatus("error"); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!options || !online || (selection.kind === "assignments" && !selection.filter.cycleId)) return;
    let active = true;
    const key = JSON.stringify(selection);
    const timer = window.setTimeout(() => {
      setPreviewStatus("loading");
      csvExportRepository.preview(selection).then((result) => {
        if (!active) return;
        setPreview(result); setPreviewKey(key); setPreviewStatus("ready");
      }).catch(() => { if (active) setPreviewStatus("error"); });
    }, 320);
    return () => { active = false; window.clearTimeout(timer); };
  }, [online, options, selection]);

  const changeSelection = (next: CsvExportSelection) => {
    setSelection(next); setPreviewStatus("loading"); setGenerated(null); setRequestId(null);
  };
  const changeFilter = <Key extends keyof CsvExportFilter>(key: Key, value: CsvExportFilter[Key]) => {
    changeSelection({ ...selection, filter: { ...selection.filter, [key]: value } });
  };
  const changeKind = (kind: CsvExportSelection["kind"]) => {
    changeSelection({
      ...selection,
      kind,
      filter: {
        ...selection.filter,
        cycleId: kind === "assignments" && !selection.filter.cycleId ? options?.currentCycleId ?? null : selection.filter.cycleId,
        monthlyStatus: kind === "assignments" ? selection.filter.monthlyStatus : null,
        visitedFrom: kind === "visits" ? selection.filter.visitedFrom : null,
        visitedTo: kind === "visits" ? selection.filter.visitedTo : null,
        tagId: null,
      },
    });
  };
  const changeScope = (scope: CsvExportSelection["scope"]) => {
    changeSelection({ ...selection, scope, filter: { ...selection.filter, assigneeId: scope === "own" ? null : selection.filter.assigneeId } });
  };

  const generate = async () => {
    if (!currentPreview || !online) return;
    setGenerating(true);
    const stableRequestId = requestId ?? crypto.randomUUID();
    setRequestId(stableRequestId);
    try {
      const result = await csvExportRepository.generate(selection, stableRequestId);
      setGenerated(result);
      showToast("CSV 파일을 만들었습니다.");
    } catch (error) {
      showToast(csvExportErrorMessage(error));
    } finally {
      setGenerating(false);
    }
  };

  const openFile = async () => {
    if (!generated || !online) return;
    setDownloading(true);
    try {
      const file = await csvExportRepository.download(generated.jobId);
      saveBase64File(file);
      showToast("CSV 다운로드를 시작했습니다.");
    } catch (error) {
      showToast(csvExportErrorMessage(error));
    } finally {
      setDownloading(false);
    }
  };

  if (loadStatus === "loading") {
    return <section className="shell-page export-page" aria-busy="true"><div className="export-loading"><span className="search-pulse" /><strong>안전한 내보내기 기준을 확인하고 있어요.</strong><p>파일이 아니라 기간과 권한 정보만 먼저 불러옵니다.</p></div></section>;
  }
  if (loadStatus === "error" || !options) {
    return <section className="shell-page export-page"><div className="export-error" role="alert"><Icon name="clipboard" size={28} /><h1>내보내기 센터를 열지 못했어요.</h1><p>연결을 확인한 뒤 페이지를 다시 열어주세요.</p><GlassButton variant="primary" onClick={() => window.location.reload()}>다시 시도</GlassButton></div></section>;
  }

  const tagOptions = selection.kind === "assignments" ? options.communicationTags : options.activityTags;
  const scopeOptions = isAdmin
    ? SCOPE_OPTIONS
    : options.teamExportAllowed
      ? SCOPE_OPTIONS.slice(0, 2)
      : SCOPE_OPTIONS.slice(0, 1);
  const periodLabel = selection.filter.cycleId ? options.cycles.find((cycle) => cycle.cycleId === selection.filter.cycleId)?.label ?? selection.filter.cycleId : "전체 기간";
  const scopeLabel = SCOPE_OPTIONS.find((option) => option.value === selection.scope)?.label ?? "내 담당";
  const description = selection.kind === "assignments" ? "학교별 월 배정과 현재 영업 상태" : "변경되지 않는 방문 이벤트와 후속 기록";

  return (
    <section className="shell-page export-page" aria-labelledby="export-title">
      <h2 className="sr-only">활동</h2>
      <header className="export-hero">
        <div><p className="shell-kicker">SALES · EXPORT CENTER</p><h1 id="export-title">필요한 기록만,<br /><em>정확하게.</em></h1><p>현재 필터를 서버에서 다시 검증해 UTF-8 CSV로 만듭니다. 전체 원본 데이터는 이 기기로 내려오지 않습니다.</p></div>
        <div className="export-trust" aria-label="CSV 보호 기준"><span><Icon name="check" size={16} />내 권한 범위</span><span><Icon name="check" size={16} />필터 재검증</span><span><Icon name="clock" size={16} />24시간 보관</span></div>
      </header>

      {!online ? <div className="export-offline" role="status"><Icon name="clock" size={17} /><span><strong>오프라인에서는 CSV를 만들 수 없습니다.</strong> 연결되면 현재 필터로 미리보기를 다시 계산합니다.</span></div> : null}

      <div className="export-layout">
        <form className="export-builder" onSubmit={(event) => { event.preventDefault(); void generate(); }}>
          <div className="export-step-heading"><span>01</span><div><p>FILE TYPE</p><h2>어떤 기록이 필요한가요?</h2></div></div>
          <SegmentedControl className="export-kind-control" label="CSV 종류" options={KIND_OPTIONS} value={selection.kind} onChange={changeKind} />
          <div className="export-kind-note"><span><Icon name={selection.kind === "assignments" ? "calendar" : "clipboard"} /></span><div><strong>{selection.kind === "assignments" ? "월별 배정 CSV" : "방문 이력 CSV"}</strong><p>{description}</p></div></div>

          <div className="export-step-heading"><span>02</span><div><p>FILTER</p><h2>파일에 담을 범위를 고르세요.</h2></div></div>
          <div className="export-scope-row"><label>내보내기 범위</label><SegmentedControl className="export-scope-control" label="내보내기 범위" options={scopeOptions} value={selection.scope} onChange={changeScope} /></div>
          <div className="export-filter-grid">
            <label><span>기간</span><select aria-label="내보내기 기간" value={selection.filter.cycleId ?? ""} onChange={(event) => changeFilter("cycleId", event.target.value || null)}>{selection.kind === "visits" ? <option value="">전체 기간</option> : null}{options.cycles.map((cycle) => <option key={cycle.cycleId} value={cycle.cycleId}>{cycle.label}{cycle.status === "active" ? " · 진행 중" : ""}</option>)}</select></label>
            <label><span>구역</span><select aria-label="구역 필터" value={selection.filter.zoneId ?? ""} onChange={(event) => changeFilter("zoneId", event.target.value || null)}><option value="">전체 구역</option>{options.zones.map((zone) => <option key={zone.zoneId} value={zone.zoneId}>{zone.name}</option>)}</select></label>
            {selection.scope !== "own" ? <label><span>담당자</span><select aria-label="담당자 필터" value={selection.filter.assigneeId ?? ""} onChange={(event) => changeFilter("assigneeId", event.target.value || null)}><option value="">전체 담당자</option>{options.employees.map((employee) => <option key={employee.employeeId} value={employee.employeeId}>{employee.displayName}</option>)}</select></label> : null}
            <label><span>행정구</span><select aria-label="행정구 필터" value={selection.filter.district ?? ""} onChange={(event) => changeFilter("district", (event.target.value || null) as CsvExportFilter["district"])}>{DISTRICTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label><span>학교급</span><select aria-label="학교급 필터" value={selection.filter.schoolType ?? ""} onChange={(event) => changeFilter("schoolType", (event.target.value || null) as CsvExportFilter["schoolType"])}>{SCHOOL_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            {selection.kind === "assignments" ? <label><span>방문 상태</span><select aria-label="방문 상태 필터" value={selection.filter.monthlyStatus ?? ""} onChange={(event) => changeFilter("monthlyStatus", (event.target.value || null) as CsvExportFilter["monthlyStatus"])}>{MONTHLY_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label> : null}
            <label><span>관심도</span><select aria-label="관심도 필터" value={selection.filter.interestScore ?? ""} onChange={(event) => changeFilter("interestScore", event.target.value === "" ? null : Number(event.target.value) as CsvExportFilter["interestScore"])}>{INTEREST_SCORES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label><span>{selection.kind === "assignments" ? "커뮤니케이션 태그" : "활동 태그"}</span><select aria-label="태그 필터" value={selection.filter.tagId ?? ""} onChange={(event) => changeFilter("tagId", event.target.value || null)}><option value="">전체 태그</option>{tagOptions.map((tag) => <option key={tag.tagId} value={tag.tagId}>{tag.label}</option>)}</select></label>
            {selection.kind === "visits" ? <><label><span>방문 시작일</span><input aria-label="방문 시작일" type="date" value={selection.filter.visitedFrom ?? ""} onChange={(event) => changeFilter("visitedFrom", event.target.value || null)} /></label><label><span>방문 종료일</span><input aria-label="방문 종료일" type="date" value={selection.filter.visitedTo ?? ""} min={selection.filter.visitedFrom ?? undefined} onChange={(event) => changeFilter("visitedTo", event.target.value || null)} /></label></> : null}
          </div>
          <label className="export-check"><input type="checkbox" checked={selection.filter.followUpOnly} onChange={(event) => changeFilter("followUpOnly", event.target.checked)} /><span aria-hidden="true"><Icon name="check" size={15} /></span><strong>후속 업무가 필요한 기록만</strong></label>
        </form>

        <aside className="export-preview" aria-live="polite">
          <div className="export-step-heading"><span>03</span><div><p>EXPORT PREVIEW</p><h2>생성 전 마지막 확인</h2></div></div>
          <div className="export-paper" data-complete={generated ? "true" : "false"}>
            <div className="export-paper__top"><span><Icon name={generated ? "check" : "clipboard"} /></span><div><small>{generated ? "CSV READY" : "CSV PREVIEW"}</small><strong>{generated ? "CSV 파일을 만들었습니다." : `${periodLabel} · ${scopeLabel}`}</strong></div></div>
            {generated ? (
              <><dl><div><dt>파일</dt><dd>{generated.fileName}</dd></div><div><dt>행 수</dt><dd>{generated.rowCount.toLocaleString("ko-KR")}건</dd></div><div><dt>보관 기한</dt><dd>{formatExpiry(generated.expiresAt)}</dd></div></dl><GlassButton className="export-primary-action" variant="primary" disabled={downloading || !online} onClick={() => void openFile()}><Icon name="download" />{downloading ? "파일 여는 중…" : "파일 열기"}</GlassButton><p className="export-expiry-note">보관 기한 뒤에는 서버와 저장소에서 더 이상 열 수 없습니다.</p></>
            ) : (
              <><div className="export-count"><span>예상 행 수</span><strong>{previewStatus === "loading" ? "…" : currentPreview ? currentPreview.rowCount.toLocaleString("ko-KR") : "—"}<small>건</small></strong></div><ul>{currentPreview?.filterSummary.map((item) => <li key={item}>{item}</li>)}</ul>{previewStatus === "error" ? <p className="export-preview-error" role="alert">미리보기를 계산하지 못했습니다. 필터와 연결을 확인해주세요.</p> : null}<GlassButton className="export-primary-action" variant="primary" disabled={!currentPreview || generating || !online} onClick={() => void generate()}><Icon name="download" />{generating ? "CSV 만드는 중…" : "CSV 생성"}</GlassButton><p className="export-expiry-note">{session.displayName}님의 현재 권한을 생성 시점에 다시 확인합니다.</p></>
            )}
          </div>
          <div className="export-safety-note"><Icon name="sparkles" size={18} /><p><strong>엑셀에서 한글이 깨지지 않도록</strong> UTF-8 BOM을 포함하며, 수식으로 해석될 수 있는 셀은 자동으로 보호합니다.</p></div>
        </aside>
      </div>
    </section>
  );
}
