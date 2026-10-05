"use client";

import type { ReactNode } from "react";

import { Icon, type IconName } from "@/components/ui/icon";

const PAGE_HEADING_IDS: Record<string, string> = {
  "학교 관리": "schools-title",
  "직원 관리": "employees-title",
  "월별 학교 배정": "cycles-title",
  "데이터 동기화": "sync-title",
  "감사 기록": "audit-title",
  설정: "admin-settings-title",
};

export function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="admin-page-heading">
      <div>
        <h1 id={PAGE_HEADING_IDS[title]}>{title}</h1>
        <span>{description}</span>
      </div>
      {action ? (
        <div className="admin-page-heading__action">{action}</div>
      ) : null}
    </header>
  );
}

export function EmptyState({
  icon,
  title,
  description,
}: {
  icon: IconName;
  title: string;
  description: string;
}) {
  return (
    <div className="admin-empty">
      <span>
        <Icon name={icon} />
      </span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}
