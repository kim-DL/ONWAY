"use client";

import { useMemo, useState } from "react";

import { GlassButton } from "@/components/ui/glass-button";
import { Icon } from "@/components/ui/icon";
import type { SalesAssignment } from "@/domain/sales";
import type { School } from "@/domain/school";
import { buildKakaoDirectionsUrlToCoordinate } from "@/features/school-detail/kakao-directions";
import {
  type ActiveSalesRoute,
  type SalesRouteMetric,
  type SalesRouteResult,
} from "./sales-route-contract";
import { canPlanRouteForSchool, hasTrustedRouteLocation } from "./sales-route-location";
import { optimizeSalesRoute, salesRouteErrorMessage } from "./sales-route-repository";

const MAX_ROUTE_SCHOOLS = 20;

export type SalesRouteCandidate = {
  assignment: SalesAssignment;
  school: School;
};

function formatDistance(distanceMeters: number) {
  if (distanceMeters < 1_000) return `${Math.max(10, Math.round(distanceMeters / 10) * 10)}m`;
  return `${(distanceMeters / 1_000).toFixed(distanceMeters < 10_000 ? 1 : 0)}km`;
}

function formatDuration(durationSeconds: number) {
  const minutes = Math.max(1, Math.round(durationSeconds / 60));
  if (minutes < 60) return `약 ${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `약 ${hours}시간` : `약 ${hours}시간 ${rest}분`;
}

function metricKey(fromSchoolId: string, toSchoolId: string) {
  return `${fromSchoolId}\u0001${toSchoolId}`;
}

function summarizeRoute(result: SalesRouteResult, orderedSchoolIds: readonly string[]) {
  const stopById = new Map(result.stops.map((stop) => [stop.schoolId, stop]));
  const metricByPair = new Map(result.metrics.map((metric) => [metricKey(metric.fromSchoolId, metric.toSchoolId), metric]));
  const legs: SalesRouteMetric[] = [];
  const stops = orderedSchoolIds.map((schoolId, index) => {
    const stop = stopById.get(schoolId);
    if (!stop) throw new Error("The saved route contains an unavailable school.");
    const fromPrevious = index === 0
      ? null
      : metricByPair.get(metricKey(orderedSchoolIds[index - 1]!, schoolId)) ?? null;
    if (index > 0 && !fromPrevious) throw new Error("The saved route metric is unavailable.");
    if (fromPrevious) legs.push(fromPrevious);
    return { ...stop, position: index + 1, fromPrevious };
  });
  const roadLegs = legs.filter((leg) => leg.source === "road").length;
  return {
    stops,
    totalDistanceMeters: legs.reduce((total, leg) => total + leg.distanceMeters, 0),
    totalDurationSeconds: legs.reduce((total, leg) => total + leg.durationSeconds, 0),
    calculationMode: roadLegs === legs.length
      ? "road" as const
      : roadLegs === 0
        ? "distanceEstimate" as const
        : "hybrid" as const,
  };
}

function defaultSchoolIds(candidates: readonly SalesRouteCandidate[]) {
  const eligible = candidates.filter(({ school }) => canPlanRouteForSchool(school));
  const unfinished = eligible.filter(({ assignment }) => assignment.monthlyStatus !== "completed");
  return (unfinished.length >= 2 ? unfinished : eligible)
    .slice(0, MAX_ROUTE_SCHOOLS)
    .map(({ school }) => school.schoolId);
}

export function SalesRoutePlanner({
  cycleId,
  candidates,
  initialRoute,
  onApply,
}: {
  cycleId: string;
  candidates: readonly SalesRouteCandidate[];
  initialRoute: ActiveSalesRoute | null;
  onApply: (route: ActiveSalesRoute) => void;
}) {
  const defaults = useMemo(() => defaultSchoolIds(candidates), [candidates]);
  const initialIds = initialRoute?.orderedSchoolIds ?? defaults;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(initialIds));
  const [startSchoolId, setStartSchoolId] = useState(() => initialIds[0] ?? "");
  const [result, setResult] = useState<SalesRouteResult | null>(() => initialRoute?.result ?? null);
  const [orderedSchoolIds, setOrderedSchoolIds] = useState<string[]>(() => initialRoute?.orderedSchoolIds ?? []);
  const [manuallyAdjusted, setManuallyAdjusted] = useState(initialRoute?.manuallyAdjusted ?? false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const eligibleCount = candidates.filter(({ school }) => canPlanRouteForSchool(school)).length;
  const unavailableCount = candidates.length - eligibleCount;
  const pendingLocationCount = candidates.filter(({ school }) => (
    canPlanRouteForSchool(school) && !hasTrustedRouteLocation(school)
  )).length;

  const selectedCount = selectedIds.size;
  const summary = useMemo(() => {
    if (!result || orderedSchoolIds.length < 2) return null;
    try {
      return summarizeRoute(result, orderedSchoolIds);
    } catch {
      return null;
    }
  }, [orderedSchoolIds, result]);

  const toggleSchool = (schoolId: string, selected: boolean) => {
    setResult(null);
    setOrderedSchoolIds([]);
    setErrorMessage(null);
    const next = new Set(selectedIds);
    if (selected && next.size < MAX_ROUTE_SCHOOLS) next.add(schoolId);
    if (!selected) next.delete(schoolId);
    setSelectedIds(next);
    if (!next.has(startSchoolId)) setStartSchoolId([...next][0] ?? "");
  };

  const selectSuggested = () => {
    setSelectedIds(new Set(defaults));
    setStartSchoolId(defaults[0] ?? "");
    setResult(null);
    setOrderedSchoolIds([]);
    setErrorMessage(null);
  };

  const selectAll = () => {
    const ids = candidates
      .filter(({ school }) => canPlanRouteForSchool(school))
      .slice(0, MAX_ROUTE_SCHOOLS)
      .map(({ school }) => school.schoolId);
    setSelectedIds(new Set(ids));
    setStartSchoolId(ids[0] ?? "");
    setResult(null);
    setOrderedSchoolIds([]);
    setErrorMessage(null);
  };

  const calculate = async () => {
    if (selectedCount < 2 || !selectedIds.has(startSchoolId)) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const nextResult = await optimizeSalesRoute({
        cycleId,
        schoolIds: [...selectedIds],
        startSchoolId,
      });
      setResult(nextResult);
      setOrderedSchoolIds(nextResult.orderedSchoolIds);
      setManuallyAdjusted(false);
    } catch (error) {
      setErrorMessage(salesRouteErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const moveStop = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (index === 0 || target < 1 || target >= orderedSchoolIds.length) return;
    setOrderedSchoolIds((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
    setManuallyAdjusted(true);
  };

  if (result && summary) {
    const modeLabel = summary.calculationMode === "road"
      ? "도로 이동시간 기준"
      : summary.calculationMode === "hybrid"
        ? "도로·거리 혼합 기준"
        : "거리 추정 기준";
    return (
      <div className="sales-route-planner sales-route-planner--result">
        <div className="sales-route-summary" role="status" aria-live="polite">
          <span className="sales-route-summary__mark"><Icon name="route" size={22} /></span>
          <div><strong>{summary.stops.length}곳 · {formatDuration(summary.totalDurationSeconds)}</strong><span>{formatDistance(summary.totalDistanceMeters)} · {modeLabel}</span></div>
          <span className="sales-route-summary__mode">추천 순서</span>
        </div>

        {summary.calculationMode !== "road" ? (
          <p className="sales-route-notice"><Icon name="sparkles" size={17} />실제 교통 상황에 따라 달라질 수 있어요. 출발 전 길안내에서 한 번 더 확인해주세요.</p>
        ) : null}

        <ol className="sales-route-order" aria-label="추천 방문 순서">
          {summary.stops.map((stop, index) => {
            return (
              <li key={stop.schoolId}>
                <span className="sales-route-order__number" aria-hidden="true">{index + 1}</span>
                <div className="sales-route-order__school">
                  <strong>{stop.name}</strong>
                  <span>{index === 0 ? "첫 학교" : `${formatDuration(stop.fromPrevious!.durationSeconds)} · ${formatDistance(stop.fromPrevious!.distanceMeters)}`}</span>
                </div>
                <div className="sales-route-order__actions">
                  <a href={buildKakaoDirectionsUrlToCoordinate(stop.name, stop.latitude, stop.longitude)} target="_blank" rel="noreferrer" aria-label={`${stop.name} 길안내`}><Icon name="route" size={18} /></a>
                  {index > 1 ? <button type="button" onClick={() => moveStop(index, -1)} aria-label={`${stop.name} 한 순서 위로`}><Icon name="arrow-up" size={18} /></button> : null}
                  {index > 0 && index < summary.stops.length - 1 ? <button type="button" onClick={() => moveStop(index, 1)} aria-label={`${stop.name} 한 순서 아래로`}><Icon name="arrow-down" size={18} /></button> : null}
                </div>
              </li>
            );
          })}
        </ol>

        <div className="sales-route-planner__footer">
          <button type="button" className="sales-route-text-action" onClick={() => { setResult(null); setOrderedSchoolIds([]); setErrorMessage(null); }}>학교 다시 선택</button>
          <GlassButton
            variant="primary"
            onClick={() => onApply({
              result: {
                ...result,
                calculationMode: summary.calculationMode,
                orderedSchoolIds,
                stops: summary.stops,
                totalDistanceMeters: summary.totalDistanceMeters,
                totalDurationSeconds: summary.totalDurationSeconds,
                warning: summary.calculationMode === "road"
                  ? null
                  : "일부 구간은 거리 추정치를 사용했습니다.",
              },
              orderedSchoolIds,
              manuallyAdjusted,
              savedAt: Date.now(),
            })}
          >이 순서로 보기</GlassButton>
        </div>
      </div>
    );
  }

  return (
    <div className="sales-route-planner">
      <div className="sales-route-planner__intro">
        <span><Icon name="route" size={22} /></span>
        <p><strong>오늘 방문할 학교를 고르세요.</strong><small>첫 학교를 고정한 뒤 이동시간이 짧은 순서로 정리합니다.</small></p>
      </div>
      <div className="sales-route-planner__quick" aria-label="빠른 선택">
        <button type="button" onClick={selectSuggested}>미완료 학교</button>
        <button type="button" onClick={selectAll}>선택 가능한 학교 전체</button>
        <span>{selectedCount}/{Math.min(eligibleCount, MAX_ROUTE_SCHOOLS)}</span>
      </div>
      {pendingLocationCount > 0 ? <p className="sales-route-location-note"><Icon name="sparkles" size={16} />{pendingLocationCount}곳은 계산할 때 공식 주소로 위치를 자동 확인해요.</p> : null}
      {unavailableCount > 0 ? <p className="sales-route-location-note"><Icon name="location" size={16} />공식 주소가 없는 {unavailableCount}곳은 선택할 수 없어요.</p> : null}

      <ul className="sales-route-candidates" aria-label="방문할 학교 선택">
        {candidates.map(({ assignment, school }) => {
          const eligible = canPlanRouteForSchool(school);
          const locationReady = hasTrustedRouteLocation(school);
          const selected = selectedIds.has(school.schoolId);
          const atLimit = !selected && selectedCount >= MAX_ROUTE_SCHOOLS;
          return (
            <li key={school.schoolId} data-disabled={!eligible ? "true" : "false"} data-selected={selected ? "true" : "false"}>
              <label className="sales-route-candidate__select">
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={!eligible || atLimit}
                  onChange={(event) => toggleSchool(school.schoolId, event.target.checked)}
                />
                <span className="sales-route-candidate__check" aria-hidden="true"><Icon name="check" size={15} /></span>
                <span><strong>{school.name}</strong><small>{eligible ? (locationReady ? (assignment.monthlyStatus === "completed" ? "방문 완료" : "방문 예정") : "주소로 자동 확인") : "공식 주소 없음"}</small></span>
              </label>
              <label className="sales-route-candidate__start" data-selected={startSchoolId === school.schoolId ? "true" : "false"}>
                <input
                  type="radio"
                  name="sales-route-start"
                  checked={startSchoolId === school.schoolId}
                  disabled={!eligible || !selected}
                  onChange={() => setStartSchoolId(school.schoolId)}
                />
                <span>첫 학교</span>
              </label>
            </li>
          );
        })}
      </ul>

      {eligibleCount < 2 ? (
        <div className="sales-route-empty" role="status"><Icon name="location" /><strong>동선을 만들 학교 정보가 부족해요.</strong><span>공식 주소가 등록된 학교가 2곳 이상 필요합니다.</span></div>
      ) : null}
      {errorMessage ? <p className="sales-route-error" role="alert">{errorMessage}</p> : null}
      <div className="sales-route-planner__footer">
        <span aria-live="polite">{busy ? "도로 이동시간을 확인하고 있어요…" : "최대 20곳까지 한 번에 계산할 수 있어요."}</span>
        <GlassButton variant="primary" disabled={busy || selectedCount < 2 || !selectedIds.has(startSchoolId)} onClick={() => void calculate()}>
          {busy ? <><Icon name="refresh" className="is-spinning" />계산 중…</> : <><Icon name="sparkles" />가까운 순서 계산</>}
        </GlassButton>
      </div>
    </div>
  );
}
