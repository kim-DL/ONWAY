"use client";

import { useId, useMemo, useRef, useState } from "react";
import { BottomSheet, BottomSheetActions } from "@/components/ui/bottom-sheet";
import { Icon } from "@/components/ui/icon";
import { OnnuriLoader } from "@/components/ui/onnuri-loader";
import { searchInputProps } from "@/components/ui/search-input-props";
import type { Customer } from "@/domain/customer";
import { CustomerCard } from "./customer-card";
import { customerDirectoryEntry, customerRegionOptions, filterCustomerDirectory } from "./customer-directory-filter";
import { useCustomerDirectoryRegions } from "./use-customer-directory-regions";
import shared from "./customer.module.css";
import styles from "./customer-directory.module.css";

const PAGE_SIZE = 32;

export function CustomerDirectory({ customers, onSelect, onClose, status = "ready", message = "", onRetry }: {
  customers: readonly Customer[]; onSelect: (customerId: string) => void; onClose: () => void;
  status?: "ready" | "loading" | "error"; message?: string; onRetry?: () => void;
}) {
  const id = useId();
  const [district, setDistrict] = useState("");
  const [dong, setDong] = useState("");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const searchRef = useRef<HTMLInputElement>(null);
  const filtersRef = useRef<HTMLDivElement>(null);
  const regions = useCustomerDirectoryRegions(customers, status === "ready");
  const entries = useMemo(() => regions.customers.map(customerDirectoryEntry), [regions.customers]);
  const districts = useMemo(() => customerRegionOptions(entries, "district"), [entries]);
  const districtEntries = useMemo(() => entries.filter((entry) => !district || entry.district === district), [entries, district]);
  const dongs = useMemo(() => customerRegionOptions(districtEntries, "dong"), [districtEntries]);
  const results = useMemo(() => filterCustomerDirectory(entries, district, dong, query), [entries, district, dong, query]);
  const reset = () => { setDistrict(""); setDong(""); setQuery(""); setVisibleCount(PAGE_SIZE); };
  return <BottomSheet open title="거래처 전체보기" onClose={onClose}>
    <div className={`${shared.workspace} ${styles.directory}`} data-customer-directory>
      <div ref={filtersRef} className={styles.filters} hidden={status !== "ready"}>
        <div className={styles.summary}><span><Icon name="building" size={18} />등록 거래처 <strong>{customers.length}곳</strong></span>
          {district || dong || query ? <button type="button" onClick={reset}>선택 초기화</button> : null}
        </div>
        <fieldset className={styles.districts}><legend>자치구·지역</legend>
          <div className={styles.districtGrid}>
            <button type="button" aria-pressed={!district} onClick={() => { setDistrict(""); setDong(""); setVisibleCount(PAGE_SIZE); }}>전체<span>{customers.length}</span></button>
            {districts.map((region) => <button key={region.value} type="button" aria-pressed={district === region.value}
              onClick={() => { setDistrict(region.value); setDong(""); setVisibleCount(PAGE_SIZE); }}>{region.value}<span>{region.count}</span></button>)}
          </div>
        </fieldset>
        <div className={styles.refineRow}>
          <label className={styles.dong}><span>행정동</span><select aria-label="행정동" value={dong} onChange={(event) => { setDong(event.target.value); setVisibleCount(PAGE_SIZE); }}>
            <option value="">전체 행정동 ({districtEntries.length})</option>
            {dongs.map((region) => <option key={region.value} value={region.value}>{region.value} ({region.count})</option>)}
          </select></label>
          <label className={styles.search}><span className={shared.srOnly}>전체 거래처에서 이름 검색</span><Icon name="search" size={18} /><input {...searchInputProps} ref={searchRef} name="customer-directory-query" aria-label="전체 거래처에서 이름 검색" placeholder="이름·초성 검색" value={query}
            onChange={(event) => { setQuery(event.target.value); setVisibleCount(PAGE_SIZE); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) event.currentTarget.blur(); }} />
            {query ? <button type="button" aria-label="전체보기 검색어 지우기" onClick={() => { setQuery(""); setVisibleCount(PAGE_SIZE); searchRef.current?.focus(); }}><Icon name="close" size={16} /></button> : null}
          </label>
        </div>
        {regions.pendingCount ? <p className={styles.regionStatus} role="status">납품 좌표로 행정동을 확인하고 있어요 · {regions.pendingCount}곳</p> : regions.failedCount ? <p className={styles.regionStatus}>행정동 미확인 {regions.failedCount}곳<button type="button" onClick={regions.retry}>다시 확인</button></p> : null}
      </div>
      {status !== "ready" ? <div className={shared.empty} role={status === "error" ? "alert" : "status"}>
        {status === "error" ? <Icon name="wifi-off" size={26} /> : <OnnuriLoader tone="customer" decorative />}<p>{status === "error" ? message : "거래처 목록을 새로 확인하고 있어요."}</p>
        {status === "error" && onRetry ? <button type="button" className={shared.textButton} onClick={onRetry}>다시 불러오기</button> : null}
      </div> : <section aria-labelledby={`${id}-results`}>
        <header className={styles.resultHeading}><h3 id={`${id}-results`}>{dong || district || "전체 거래처"}</h3><span role="status" aria-live="polite">{results.length}곳</span></header>
        {results.length ? <ul className={styles.list}>{results.slice(0, visibleCount).map((customer) => <li key={customer.customerId}>
          <CustomerCard customer={customer} compact onSelect={() => onSelect(customer.customerId)} />
        </li>)}</ul> : <div className={shared.empty}><Icon name="search" size={28} /><h3>{customers.length ? "조건에 맞는 거래처가 없어요." : "등록된 거래처가 아직 없어요."}</h3>
          {district || dong || query ? <button type="button" className={shared.textButton} onClick={reset}>전체 거래처 보기</button> : null}
        </div>}
        {results.length > visibleCount ? <button className={styles.more} type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>거래처 더 보기 <span>{visibleCount} / {results.length}</span><Icon name="arrow-down" size={17} /></button> : null}
      </section>}
      {status === "ready" ? <BottomSheetActions className={styles.footer ?? ""}>
        <span>{district || dong || query ? "선택한 거래처" : "전체 거래처"} <strong>{results.length}곳</strong></span>
        <button type="button" onClick={() => { filtersRef.current?.scrollIntoView({ block: "start" }); filtersRef.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({ preventScroll: true }); }}><Icon name="location" size={18} />지역·행정동 선택</button>
      </BottomSheetActions> : null}
    </div>
  </BottomSheet>;
}
