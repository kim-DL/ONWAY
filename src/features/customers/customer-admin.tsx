"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";

import { GlassButton } from "@/components/ui/glass-button";
import { Icon } from "@/components/ui/icon";
import { searchInputProps } from "@/components/ui/search-input-props";
import { useToast } from "@/components/ui/toast";
import { isVerifiedAdminSession } from "@/domain/auth";
import type { Customer } from "@/domain/customer";
import type { AuthenticatedSession } from "@/features/auth/auth-context";

import { CustomerBadges } from "./customer-card";
import { customerAddress } from "./customer-address";
import { searchCustomers } from "./customer-search";
import { useCustomers } from "./use-customers";
import styles from "./customer.module.css";

const CustomerEditor = dynamic(() => import("./customer-editor").then((module) => module.CustomerEditor));

function CustomerAdminContent({ session }: { session: AuthenticatedSession }) {
  const { showToast } = useToast();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Customer | "new" | null>(null);
  const clearSensitiveState = useCallback(() => { setEditing(null); setQuery(""); }, []);
  const catalog = useCustomers(session, clearSensitiveState);
  const customers = useMemo(() => query.trim() ? searchCustomers(catalog.customers, query) : [...catalog.customers].sort((a, b) => Number(a.status === "closed") - Number(b.status === "closed") || a.name.localeCompare(b.name, "ko-KR")), [catalog.customers, query]);
  return <section className={styles.admin} aria-labelledby="customer-admin-heading" data-customer-admin>
    <header className={styles.heading}><div><h2 id="customer-admin-heading">거래처 관리</h2><p className={styles.muted}>납품 안내 · 출입 정보 · 연락처</p></div><GlassButton compact variant="primary" onClick={() => setEditing("new")} disabled={catalog.status !== "ready"}><Icon name="plus" size={18} />거래처 등록</GlassButton></header>
    <label className={styles.search}><Icon name="search" size={21} /><input {...searchInputProps} name="admin-customer-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="거래처명 또는 초성 검색" aria-label="관리할 거래처 검색" /></label>
    {catalog.status === "error" ? <div className={styles.empty} role="alert"><p>{catalog.message}</p><GlassButton onClick={catalog.retry}>다시 불러오기</GlassButton></div> : catalog.status === "loading" ? <p className={styles.empty} role="status">거래처 정보를 불러오고 있어요.</p> : <>
      <p className={styles.resultCount} role="status">{customers.length}곳</p>
      {customers.length ? <ul className={styles.adminList}>{customers.map((customer) => <li key={customer.customerId}><button type="button" onClick={() => setEditing(customer)} aria-label={`${customer.name} 수정`}><span><strong>{customer.name}</strong><small>{customerAddress(customer)}</small></span><CustomerBadges customer={customer} /><Icon name="chevron-right" size={20} /></button></li>)}</ul> : <div className={styles.empty}><h3>{query ? "등록된 거래처를 찾을 수 없습니다." : "등록된 거래처가 없습니다."}</h3><p>거래처 등록 버튼으로 납품 정보를 추가해주세요.</p></div>}
    </>}
    {editing && catalog.canRetainDraft ? <CustomerEditor key={editing === "new" ? "new" : `${editing.customerId}:${editing.revision}`} customer={editing === "new" ? null : editing} refreshMessage={catalog.status === "error" ? "목록 갱신이 지연되고 있어요. 작성 중인 내용은 유지됩니다." : ""} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); catalog.retry(); showToast("거래처 정보를 저장했어요.", "success"); }} /> : null}
  </section>;
}

export function CustomerAdmin({ session }: { session: AuthenticatedSession }) {
  if (!isVerifiedAdminSession(session.claims)) return <p role="alert">관리자 권한이 필요합니다.</p>;
  return <CustomerAdminContent key={`${session.uid}:${session.claims.sessionVersion}:${session.claims.permissionsVersion}`} session={session} />;
}
