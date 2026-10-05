"use client";

import { useRef, useState } from "react";

import { GlassButton } from "@/components/ui/glass-button";
import { Icon } from "@/components/ui/icon";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { useAuth } from "@/features/auth/auth-context";

import type { AdminActivityTag, AdminWorkspaceData } from "../admin-contract";
import { formatDate, initials } from "../admin-display";
import { useAdminInteraction } from "../admin-interaction";
import { PageHeading } from "../admin-page-parts";
import { adminErrorMessage, adminRepository } from "../admin-repository";

const DEFAULT_ACTIVITY_TAG_LABELS = [
  "첫 방문",
  "담당자 상담",
  "샘플 전달",
  "견적 요청",
  "재방문 약속",
  "담당자 부재",
] as const;

type EditableActivityTag = Pick<AdminActivityTag, "tagId" | "label" | "active"> & {
  clientId: string;
};

function editableActivityTags(tags: AdminActivityTag[]): EditableActivityTag[] {
  return tags.map((tag) => ({
    tagId: tag.tagId,
    label: tag.label,
    active: tag.active,
    clientId: tag.tagId,
  }));
}

export function SettingsPage({
  data,
  session,
  onReload,
}: {
  data: AdminWorkspaceData;
  session: AuthenticatedSession;
  onReload: () => Promise<void>;
}) {
  const { logout } = useAuth();
  const { showToast } = useToast();
  const interaction = useAdminInteraction();
  const [minimumVersion, setMinimumVersion] = useState(
    data.settings.minimumAppVersion ?? "",
  );
  const [maintenance, setMaintenance] = useState(data.settings.maintenanceMode);
  const [saving, setSaving] = useState(false);
  const [activityTags, setActivityTags] = useState<EditableActivityTag[]>(() => editableActivityTags(data.activityTags));
  const [savingTags, setSavingTags] = useState(false);
  const tagsSavePending = useRef(false);
  const save = async () => {
    const release = interaction.begin();
    if (!release) return;
    setSaving(true);
    try {
      await adminRepository.updateSettings({
        minimumAppVersion: minimumVersion.trim() || null,
        maintenanceMode: maintenance,
      });
      await onReload();
      showToast("앱 운영 설정을 반영했습니다.");
    } catch (error) {
      showToast(adminErrorMessage(error));
    } finally {
      release();
      setSaving(false);
    }
  };
  const addActivityTag = (label = "") => {
    if (tagsSavePending.current) return;
    setActivityTags((current) => current.length >= 20 ? current : [...current, {
      tagId: "",
      label,
      active: true,
      clientId: crypto.randomUUID(),
    }]);
  };
  const applyDefaultActivityTags = () => {
    if (tagsSavePending.current) return;
    setActivityTags(DEFAULT_ACTIVITY_TAG_LABELS.map((label) => ({
      tagId: "",
      label,
      active: true,
      clientId: crypto.randomUUID(),
    })));
  };
  const updateActivityTag = (clientId: string, patch: Partial<Pick<EditableActivityTag, "label" | "active">>) => {
    if (tagsSavePending.current) return;
    setActivityTags((current) => current.map((tag) => tag.clientId === clientId ? { ...tag, ...patch } : tag));
  };
  const removeActivityTag = (clientId: string) => {
    if (tagsSavePending.current) return;
    setActivityTags((current) => current.filter((tag) => tag.clientId !== clientId));
  };
  const saveActivityTags = async () => {
    if (tagsSavePending.current) return;
    const cleaned = activityTags.map((tag) => ({ ...tag, label: tag.label.trim() }));
    if (cleaned.length === 0 || cleaned.some((tag) => tag.label.length === 0)) {
      showToast("활동 태그 이름을 한 글자 이상 입력해주세요.");
      return;
    }
    const labels = cleaned.map((tag) => tag.label.toLocaleLowerCase("ko-KR"));
    if (new Set(labels).size !== labels.length) {
      showToast("같은 이름의 활동 태그는 한 번만 등록할 수 있습니다.");
      return;
    }
    const release = interaction.begin();
    if (!release) return;
    tagsSavePending.current = true;
    setSavingTags(true);
    try {
      const result = await adminRepository.updateActivityTags({
        tags: cleaned.map((tag) => ({
          tagId: tag.tagId || null,
          label: tag.label,
          active: tag.active,
        })),
      });
      setActivityTags(editableActivityTags(result.tags));
      await onReload();
      showToast("영업 활동 태그를 반영했습니다.");
    } catch (error) {
      showToast(adminErrorMessage(error));
    } finally {
      release();
      tagsSavePending.current = false;
      setSavingTags(false);
    }
  };
  return (
    <section className="admin-page" aria-labelledby="admin-settings-title">
      <PageHeading
        title="설정"
        description="현장 앱에 적용할 공개 운영 정책과 현재 관리자 세션을 관리합니다."
      />
      <div className="settings-admin-grid">
        <article className="admin-panel">
          <header>
            <div>
              <h2>현장 앱 운영 정책</h2>
            </div>
            <StatusBadge tone={maintenance ? "attention" : "success"}>
              {maintenance ? "점검 모드" : "정상 운영"}
            </StatusBadge>
          </header>
          <fieldset className="admin-form admin-controls" disabled={saving} aria-label="현장 앱 운영 정책">
            <label>
              <span>최소 지원 앱 버전</span>
              <input
                value={minimumVersion}
                disabled={saving}
                onChange={(event) => setMinimumVersion(event.target.value)}
                placeholder="비워두면 제한 없음"
              />
              <small>
                이 버전보다 낮은 클라이언트에 업데이트 안내를 표시할 기준입니다.
              </small>
            </label>
            <label className="admin-switch-row admin-switch-row--warning">
              <span>
                <strong>유지보수 모드</strong>
                <small>
                  현장 직원에게 점검 상태를 알립니다. 저장 전 운영 공지를
                  확인하세요.
                </small>
              </span>
              <input
                type="checkbox"
                checked={maintenance}
                disabled={saving}
                onChange={(event) => setMaintenance(event.target.checked)}
              />
            </label>
            <dl className="settings-readonly">
              <div>
                <dt>현재 영업 Cycle</dt>
                <dd>{data.settings.currentSalesCycleId ?? "없음"}</dd>
              </div>
              <div>
                <dt>공용 Catalog 버전</dt>
                <dd>v{data.settings.commonCatalogVersion}</dd>
              </div>
              <div>
                <dt>마지막 변경</dt>
                <dd>{formatDate(data.settings.updatedAt)}</dd>
              </div>
            </dl>
            <GlassButton
              variant="primary"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? "정책 반영 중…" : "운영 설정 저장"}
            </GlassButton>
          </fieldset>
        </article>
        <article className="admin-panel activity-tag-admin" aria-busy={savingTags}>
          <header>
            <div>
              <h2>영업 활동 태그</h2>
            </div>
            <StatusBadge tone={activityTags.some((tag) => tag.active) ? "success" : "attention"}>
              활성 {activityTags.filter((tag) => tag.active).length}개
            </StatusBadge>
          </header>
          <div className="activity-tag-admin__intro">
            <span><Icon name="sparkles" size={18} /></span>
            <p><strong>방문 결과를 빠르게 분류합니다.</strong>영업 직원은 방문 기록에서 여러 태그를 선택하고, 태그는 이력과 CSV에 함께 보존됩니다.</p>
          </div>
          {activityTags.length > 0 ? (
            <div className="activity-tag-admin__list">
              {activityTags.map((tag, index) => (
                <div className="activity-tag-admin__row" data-active={tag.active} key={tag.clientId}>
                  <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <label>
                    <span className="sr-only">활동 태그 {index + 1} 이름</span>
                    <input
                      maxLength={40}
                      value={tag.label}
                      disabled={savingTags}
                      placeholder="활동 태그 이름"
                      onChange={(event) => updateActivityTag(tag.clientId, { label: event.target.value })}
                    />
                  </label>
                  <label className="activity-tag-admin__toggle">
                    <input
                      type="checkbox"
                      checked={tag.active}
                      disabled={savingTags}
                      onChange={(event) => updateActivityTag(tag.clientId, { active: event.target.checked })}
                    />
                    <span>{tag.active ? "사용" : "중지"}</span>
                  </label>
                  {!tag.tagId ? (
                    <button type="button" disabled={savingTags} aria-label={`${tag.label || `활동 태그 ${index + 1}`} 삭제`} onClick={() => removeActivityTag(tag.clientId)}>
                      <Icon name="trash" size={17} />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="activity-tag-admin__empty">
              <Icon name="clipboard" size={24} />
              <strong>아직 활동 태그가 없습니다.</strong>
              <p>현장에서 바로 쓸 수 있는 기본 6개 태그로 시작할 수 있습니다.</p>
              <GlassButton compact disabled={savingTags} onClick={applyDefaultActivityTags}>기본 태그 구성</GlassButton>
            </div>
          )}
          <div className="activity-tag-admin__actions">
            <button type="button" disabled={savingTags || activityTags.length >= 20} onClick={() => addActivityTag()}><Icon name="sparkles" size={17} />태그 추가</button>
            <GlassButton variant="primary" disabled={savingTags || activityTags.length === 0} onClick={() => void saveActivityTags()}>
              {savingTags ? "태그 반영 중…" : "활동 태그 저장"}
            </GlassButton>
          </div>
        </article>
        <article className="admin-panel admin-session-card">
          <header>
            <div>
              <h2>관리자 계정</h2>
            </div>
            <span className="admin-session-card__avatar">
              {initials(session.displayName)}
            </span>
          </header>
          <strong>{session.displayName}</strong>
          <p>{session.claims.employeeId}</p>
          <div>
            <StatusBadge tone="success">Google 인증</StatusBadge>
            <StatusBadge tone="success">서버 승인</StatusBadge>
            <StatusBadge>Session v{session.claims.sessionVersion}</StatusBadge>
          </div>
          <ul>
            <li>
              <Icon name="check" size={15} />
              Google Provider 확인
            </li>
            <li>
              <Icon name="check" size={15} />
              서버 허용목록 확인
            </li>
            <li>
              <Icon name="check" size={15} />
              활성 admin 역할 확인
            </li>
          </ul>
          <GlassButton variant="quiet" onClick={() => { if (interaction.canNavigate()) void logout(); }}>
            <Icon name="logout" />
            안전하게 로그아웃
          </GlassButton>
        </article>
      </div>
    </section>
  );
}
