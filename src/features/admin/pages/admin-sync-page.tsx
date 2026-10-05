"use client";

import { useState } from "react";

import { GlassButton } from "@/components/ui/glass-button";
import { Icon } from "@/components/ui/icon";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";

import type { AdminWorkspaceData, NeisPreview } from "../admin-contract";
import { CHANGE_LABELS, formatDate, schoolNeedsReview, SYNC_STATUS_LABELS } from "../admin-display";
import { useAdminInteraction } from "../admin-interaction";
import { KakaoReviewCard } from "../admin-kakao-review-card";
import { EmptyState, PageHeading } from "../admin-page-parts";
import { adminErrorMessage, adminRepository } from "../admin-repository";

const RISKY_CHANGE_TYPES = new Set([
  "NAME_CHANGED",
  "ADDRESS_CHANGED",
  "TYPE_CHANGED",
  "MISSING",
]);

function changeName(change: NeisPreview["changes"][number]) {
  const oldName =
    typeof change.oldData?.name === "string" ? change.oldData.name : null;
  const newName =
    typeof change.newData?.name === "string" ? change.newData.name : null;
  return newName ?? oldName ?? change.schoolCode;
}

export function SyncPage({
  data,
  onReload,
}: {
  data: AdminWorkspaceData;
  onReload: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const interaction = useAdminInteraction();
  const [tab, setTab] = useState<"neis" | "kakao">("neis");
  const [preview, setPreview] = useState<NeisPreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [working, setWorking] = useState(false);
  const runPreview = async () => {
    const release = interaction.begin();
    if (!release) return;
    setWorking(true);
    try {
      const result = await adminRepository.previewNeis();
      setPreview(result);
      setRiskAcknowledged(false);
      setSelected(
        new Set(
          result.changes
            .filter((change) => !RISKY_CHANGE_TYPES.has(change.type))
            .map((change) => change.changeId),
        ),
      );
      showToast("DB를 변경하지 않고 NEIS 차이를 계산했습니다.");
    } catch (error) {
      showToast(adminErrorMessage(error));
    } finally {
      release();
      setWorking(false);
    }
  };
  const selectedChanges =
    preview?.changes.filter((change) => selected.has(change.changeId)) ?? [];
  const hasRisky = selectedChanges.some((change) =>
    RISKY_CHANGE_TYPES.has(change.type),
  );
  const apply = async () => {
    if (!preview || preview.status === "SUSPICIOUS_RESULT" || selected.size === 0 || (hasRisky && !riskAcknowledged))
      return;
    const release = interaction.begin();
    if (!release) return;
    setWorking(true);
    try {
      await adminRepository.applyNeis({
        runId: preview.runId,
        approvedChangeIds: [...selected],
        confirmRiskyChanges: hasRisky,
      });
      await onReload();
      setPreview(null);
      showToast(
        `${selected.size}개 변경을 적용하고 검색 Catalog를 갱신했습니다.`,
      );
    } catch (error) {
      showToast(adminErrorMessage(error));
    } finally {
      release();
      setWorking(false);
    }
  };
  const needsLocation = data.schools.filter(schoolNeedsReview);
  const refreshKakao = async (schoolId: string) => {
    const release = interaction.begin();
    if (!release) return;
    setWorking(true);
    try {
      await adminRepository.matchKakao(schoolId);
      await onReload();
      showToast("Kakao 후보를 갱신했습니다.");
    } catch (error) {
      showToast(adminErrorMessage(error));
    } finally {
      release();
      setWorking(false);
    }
  };
  return (
    <section className="admin-page" aria-labelledby="sync-title">
      <PageHeading
        title="데이터 동기화"
        description="원천 데이터는 반드시 미리보고, 승인한 항목만 서버에서 반영합니다."
      />
      <fieldset className="admin-controls" disabled={working} aria-label="데이터 동기화 설정">
      <div className="admin-sync-tabs" role="tablist" aria-label="데이터 종류" onKeyDown={(event) => {
        if (working || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === "Home" ? "neis" : event.key === "End" ? "kakao" : tab === "neis" ? "kakao" : "neis";
        setTab(next);
        event.currentTarget.querySelector<HTMLButtonElement>(`[id="admin-tab-${next}"]`)?.focus();
      }}>
        <button
          type="button"
          disabled={working}
          role="tab"
          id="admin-tab-neis"
          aria-controls={tab === "neis" ? "admin-panel-neis" : undefined}
          tabIndex={tab === "neis" ? 0 : -1}
          aria-selected={tab === "neis"}
          onClick={() => setTab("neis")}
        >
          <Icon name="building" size={18} />
          NEIS 학교 정보
        </button>
        <button
          type="button"
          role="tab"
          id="admin-tab-kakao"
          aria-controls={tab === "kakao" ? "admin-panel-kakao" : undefined}
          tabIndex={tab === "kakao" ? 0 : -1}
          aria-selected={tab === "kakao"}
          onClick={() => setTab("kakao")}
        >
          <Icon name="location" size={18} />
          Kakao 위치 검토 <span>{needsLocation.length}</span>
        </button>
      </div>
      {tab === "neis" ? (
        <div className="sync-layout" role="tabpanel" id="admin-panel-neis" aria-labelledby="admin-tab-neis">
          <article className="admin-panel sync-command">
            <header>
              <div>
                  <h2>학교 기준정보 미리보기</h2>
              </div>
              <StatusBadge
                tone={
                  data.syncRuns[0]?.status === "COMPLETED"
                    ? "success"
                    : "neutral"
                }
              >
                {data.syncRuns[0]?.status
                  ? (SYNC_STATUS_LABELS[data.syncRuns[0].status] ??
                    data.syncRuns[0].status)
                  : "실행 전"}
              </StatusBadge>
            </header>
            <p>
              대전 초·중·고 학교 목록을 가져와 현재 DB와 비교합니다.
              미리보기만으로는 학교·현장·영업 데이터가 바뀌지 않습니다.
            </p>
            <dl>
              <div>
                <dt>최근 실행</dt>
                <dd>{formatDate(data.syncRuns[0]?.startedAt ?? null)}</dd>
              </div>
              <div>
                <dt>검색 Catalog</dt>
                <dd>v{data.settings.commonCatalogVersion}</dd>
              </div>
              <div>
                <dt>최근 적용</dt>
                <dd>{data.syncRuns[0]?.appliedCount ?? 0}건</dd>
              </div>
            </dl>
            <GlassButton
              variant="primary"
              disabled={working}
              onClick={() => void runPreview()}
            >
              <Icon name="refresh" />
              {working ? "차이 계산 중…" : "최신 목록 가져와 비교"}
            </GlassButton>
          </article>
          {preview ? (
            <article className="admin-panel sync-preview">
              <header>
                <div>
                      <h2>적용 항목 선택</h2>
                </div>
                <StatusBadge
                  tone={
                    preview.status === "SUSPICIOUS_RESULT"
                      ? "attention"
                      : "info"
                  }
                >
                  {SYNC_STATUS_LABELS[preview.status] ?? preview.status}
                </StatusBadge>
              </header>
              <div className="sync-counts">
                <span>
                  <small>신규</small>
                  <strong>{preview.newCount}</strong>
                </span>
                <span>
                  <small>변경</small>
                  <strong>{preview.changedCount}</strong>
                </span>
                <span>
                  <small>누락</small>
                  <strong>{preview.missingCount}</strong>
                </span>
                <span>
                  <small>원천 전체</small>
                  <strong>{preview.sourceCount}</strong>
                </span>
              </div>
              {preview.suspiciousReasons.length > 0 ? (
                <div className="sync-risk-warning" role="alert">
                  <Icon name="bell" />
                  <span>
                    <strong>안전 임계값을 초과했습니다.</strong>
                    {preview.suspiciousReasons.join(" ")} 이 실행은 적용할 수
                    없습니다.
                  </span>
                </div>
              ) : null}
              <div className="sync-select-actions">
                <button
                  type="button"
                  onClick={() => {
                    setRiskAcknowledged(false);
                    setSelected(
                      new Set(
                        preview.changes
                          .filter(
                            (change) => !RISKY_CHANGE_TYPES.has(change.type),
                          )
                          .map((change) => change.changeId),
                      ),
                    );
                  }}
                >
                  낮은 위험만 선택
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRiskAcknowledged(false);
                    setSelected(
                      new Set(preview.changes.map((change) => change.changeId)),
                    );
                  }}
                >
                  전체 선택
                </button>
                <button type="button" onClick={() => { setRiskAcknowledged(false); setSelected(new Set()); }}>
                  선택 해제
                </button>
              </div>
              <div className="sync-change-list">
                {preview.changes.map((change) => (
                  <label
                    key={change.changeId}
                    data-risk={RISKY_CHANGE_TYPES.has(change.type)}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(change.changeId)}
                      onChange={(event) => {
                        setRiskAcknowledged(false);
                        setSelected((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(change.changeId);
                          else next.delete(change.changeId);
                          return next;
                        });
                      }}
                    />
                    <span aria-hidden="true">
                      <Icon name="check" size={14} />
                    </span>
                    <div>
                      <strong>{changeName(change)}</strong>
                      <small>{change.schoolCode}</small>
                    </div>
                    <StatusBadge
                      tone={
                        RISKY_CHANGE_TYPES.has(change.type)
                          ? "attention"
                          : "info"
                      }
                    >
                      {CHANGE_LABELS[change.type]}
                    </StatusBadge>
                  </label>
                ))}
              </div>
              {hasRisky ? (
                <label className="admin-check-row sync-risk-confirm">
                  <input
                    type="checkbox"
                    checked={riskAcknowledged}
                    onChange={(event) =>
                      setRiskAcknowledged(event.target.checked)
                    }
                  />
                  <span aria-hidden="true">
                    <Icon name="check" size={14} />
                  </span>
                  <strong>
                    교명·주소·학교급·누락 위험 항목을 확인했습니다.
                  </strong>
                </label>
              ) : null}
              <footer>
                <span>
                  <strong>{selected.size}</strong>개 항목 선택
                </span>
                <GlassButton
                  variant="primary"
                  disabled={
                    working ||
                    selected.size === 0 ||
                    (hasRisky && !riskAcknowledged) ||
                    preview.status === "SUSPICIOUS_RESULT"
                  }
                  onClick={() => void apply()}
                >
                  {working ? "안전하게 적용 중…" : "선택 항목 적용"}
                </GlassButton>
              </footer>
            </article>
          ) : (
            <article className="admin-panel sync-history">
              <header>
                <div>
                      <h2>최근 실행 기록</h2>
                </div>
              </header>
              {data.syncRuns.length ? (
                <ul>
                  {data.syncRuns.map((run) => (
                    <li key={run.runId}>
                      <StatusBadge
                        tone={
                          run.status === "COMPLETED"
                            ? "success"
                            : run.status === "FAILED" ||
                                run.status === "SUSPICIOUS_RESULT"
                              ? "attention"
                              : "neutral"
                        }
                      >
                        {SYNC_STATUS_LABELS[run.status] ?? run.status}
                      </StatusBadge>
                      <span>
                        <strong>{formatDate(run.startedAt)}</strong>
                        <small>
                          신규 {run.newCount} · 변경 {run.changedCount} · 누락{" "}
                          {run.missingCount}
                        </small>
                      </span>
                      <em>{run.appliedCount} 적용</em>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon="refresh"
                  title="동기화 실행 기록이 없습니다."
                  description="미리보기를 실행하면 이곳에 안전한 변경 이력이 남습니다."
                />
              )}
            </article>
          )}
        </div>
      ) : (
        <div className="kakao-workspace" role="tabpanel" id="admin-panel-kakao" aria-labelledby="admin-tab-kakao">
          <div className="kakao-summary">
            <span>
              <small>관리자 확정</small>
              <strong>
                {
                  data.schools.filter(
                    (school) => school.locationStatus === "confirmed",
                  ).length
                }
              </strong>
            </span>
            <span>
              <small>검토·조회 대기</small>
              <strong>
                {
                  needsLocation.filter(
                    (school) => school.locationStatus !== "failed",
                  ).length
                }
              </strong>
            </span>
            <span>
              <small>매칭 실패</small>
              <strong>
                {
                  needsLocation.filter(
                    (school) => school.locationStatus === "failed",
                  ).length
                }
              </strong>
            </span>
          </div>
          {data.kakaoReviews
            .filter(
              (review) =>
                review.status === "needsReview" || review.status === "failed",
            )
            .map((review) => (
              <KakaoReviewCard
                key={review.schoolId}
                review={review}
                onReload={onReload}
              />
            ))}
          {needsLocation.filter(
            (school) =>
              !data.kakaoReviews.some(
                (review) => review.schoolId === school.schoolId,
              ),
          ).length > 0 ? (
            <article className="admin-panel kakao-unmatched">
              <header>
                <div>
                      <h2>후보 조회가 필요한 학교</h2>
                </div>
              </header>
              {needsLocation
                .filter(
                  (school) =>
                    !data.kakaoReviews.some(
                      (review) => review.schoolId === school.schoolId,
                    ),
                )
                .map((school) => (
                  <div key={school.schoolId}>
                    <span>
                      <strong>{school.name}</strong>
                      <small>{school.roadAddress ?? "주소 없음"}</small>
                    </span>
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => void refreshKakao(school.schoolId)}
                    >
                      후보 조회
                    </button>
                  </div>
                ))}
            </article>
          ) : null}
          {data.kakaoReviews.filter(
            (review) =>
              review.status === "needsReview" || review.status === "failed",
          ).length === 0 && needsLocation.length === 0 ? (
            <EmptyState
              icon="check"
              title="위치 검토가 모두 끝났습니다."
              description="관리자 확정 위치는 이후 자동 매칭보다 항상 우선합니다."
            />
          ) : null}
        </div>
      )}
      </fieldset>
    </section>
  );
}
