import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { normalizeCustomerName, getCustomerChoseong, type Customer } from "../../../src/domain/customer";
import { RecentCustomerCard } from "../../../src/features/customers/customer-card";
import { CustomerDetail } from "../../../src/features/customers/customer-detail";
import { CustomerPhotoPicker } from "../../../src/features/customers/customer-photo-picker";
import { prepareCustomerPhoto } from "../../../src/features/customers/customer-photo-preparation";
import { CustomerDirectory } from "../../../src/features/customers/customer-directory";
import styles from "../../../src/features/customers/customer.module.css";
import { SchoolPhotoGallery } from "../../../src/features/school-detail/school-photo-gallery";
import type { School, SchoolFieldProfile, SchoolFieldProfilePatch, SchoolPhoto } from "../../../src/domain/school";
import type { AuthenticatedSession } from "../../../src/features/auth/auth-context";
import { SchoolDetail } from "../../../src/features/school-detail/school-detail";
import type { CachedSchoolDetail } from "../../../src/features/school-detail/school-detail-cache";
import { ToastProvider } from "../../../src/components/ui/toast";
import { setHeaderMotionPaused } from "../../../src/features/app-shell/header-motion-preference";

const fixturePassword = document.documentElement.dataset.passwordCase === "long" ? '0012*#<>&"'.repeat(12) : "0012*";
const customers = ["강은유통", "매일식품", "도담식자재", "온유푸드 대전직영물류센터", "마음담은식품"].map((name, index) => ({
  customerId: `PRESENTATION-${index}`, companyId: "onnuri", name, normalizedName: name, choseongName: "ㄱㅇ",
  district: "", administrativeDong: "", officialAddress: "대전광역시 서구 둔산로 100", deliveryAddress: index === 3 ? "대전광역시 대덕구 산업단지길 120번길 30, 후면 물류창고 2층" : `대전광역시 서구 둔산로 ${100 + index}`,
  accessPassword: fixturePassword, accessPasswordState: "registered", deliveryLocationDescription: "건물 뒤편 흰색 셔터 앞에 내려주세요.",
  deliveryPoint: { latitude: 36.35, longitude: 127.38 },
  contacts: [{ id: "CONTACT", name: "김소은", role: "부장", phoneNumber: "010-1234-5678", isPrimary: true }],
  status: "active", noticeType: index === 0 ? "changed" : index === 1 ? "new" : "normal", changeNote: "", revision: 1,
  createdAt: "2026-09-06T00:00:00.000Z", updatedAt: "2026-09-06T00:00:00.000Z", createdBy: "EMP", updatedBy: "EMP",
  overviewPhoto: index < 2 ? { photoId: `00000000-0000-4000-8000-00000000000${index}`, width: 640, height: 400 } : null,
}) as Customer);

function Fixture() {
  const [selected, setSelected] = useState<Customer | null>(null);
  useEffect(() => {
    const clear = () => setSelected(null);
    const pause = (event: Event) => setHeaderMotionPaused((event as CustomEvent<boolean>).detail);
    window.addEventListener("fixture:clear-private-view", clear);
    window.addEventListener("fixture:motion-paused", pause);
    return () => {
      window.removeEventListener("fixture:clear-private-view", clear);
      window.removeEventListener("fixture:motion-paused", pause);
    };
  }, []);
  return <div className="workspace-shell" data-mode="customer"><div className="aurora-background" aria-hidden="true"><i /><i /><i /></div><main className={styles.workspace} style={{ maxWidth: 600, padding: "20px 12px 28px", margin: "auto" }}>
    <header style={{ marginBottom: 24 }}><p className="shell-greeting">김대인 부장님, 반가워요.</p><h1 style={{ fontSize: 30, lineHeight: 1.3, margin: "12px 0" }}>거래처 정보를<br />한눈에.</h1></header>
    <section className={styles.recentSection} aria-labelledby="recent-heading">
      <div className={styles.recentHeading}><h2 id="recent-heading">최근 검색 거래처</h2><span>5곳</span></div>
      <ul className={styles.recentList}>{customers.map((customer) => <li key={customer.customerId}><RecentCustomerCard customer={customer} onSelect={() => setSelected(customer)} /></li>)}</ul>
    </section>
    {selected ? <CustomerDetail customer={selected} onClose={() => setSelected(null)} onEdit={() => undefined} /> : null}
  </main></div>;
}
function PickerFixture() {
  const [file, setFile] = useState<File | null>(null);
  const [removed, setRemoved] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [reading, setReading] = useState(false);
  const [preparedResult, setPreparedResult] = useState("");
  return <main data-photo-reading={reading} style={{ maxWidth: 540, padding: 16, margin: "auto", background: "#fff" }}><h1>거래처 사진 등록</h1><h2>거래처 등록</h2><h3>기본 정보</h3><CustomerPhotoPicker customer={null} file={file} removed={removed} disabled={disabled} onReadingChange={setReading} onChange={(next) => { setFile(next); setRemoved(!next); setPreparedResult(""); }} /><button type="button" onClick={() => setDisabled((current) => !current)}>저장 상태 전환</button><button type="button" disabled={!file || reading || disabled} onClick={() => {
    if (file) void prepareCustomerPhoto(file).then((prepared) => setPreparedResult(`${prepared.type}:${prepared.size}`)).catch(() => setPreparedResult("failed"));
  }}>사진 저장 준비 확인</button><output aria-label="검증용 사진 준비 결과">{preparedResult}</output></main>;
}
const directoryCustomers: Customer[] = Array.from({ length: 40 }, (_, index) => {
  const district = index < 20 ? "서구" : index < 32 ? "대덕구" : "중구";
  const administrativeDong = district === "서구" ? index % 2 ? "둔산2동" : "둔산1동" : district === "대덕구" ? "오정동" : "선화동";
  const name = `거래처 ${String(index + 1).padStart(2, "0")}`;
  return { ...customers[index % customers.length]!, customerId: `DIRECTORY-${index}`, name, normalizedName: normalizeCustomerName(name), choseongName: getCustomerChoseong(name),
    district, administrativeDong: index === 0 ? "" : administrativeDong, deliveryAddress: `대전광역시 ${district} 검증로 ${index + 1}`,
    officialAddress: `대전광역시 ${district} 검증로 ${index + 1}`, overviewPhoto: index === 0 ? customers[0]!.overviewPhoto : null };
});
function DirectoryFixture() {
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState<Customer | null>(null);
  return <main className={styles.workspace}><h1>거래처 전체보기 검증</h1><button type="button" onClick={() => setOpen(true)}>전체보기 열기</button>
    {open ? <CustomerDirectory customers={directoryCustomers} onSelect={(id) => setSelected(directoryCustomers.find((customer) => customer.customerId === id) ?? null)} onClose={() => setOpen(false)} /> : null}
    {selected ? <CustomerDetail customer={selected} onClose={() => setSelected(null)} onEdit={() => undefined} /> : null}
  </main>;
}
const kind = document.documentElement.dataset.fixture;
const schoolPhotos: SchoolPhoto[] = (["01", "02", "03"] as const).map((slotId, index) => ({
  schoolId: "SYNTHETIC-SCHOOL", slotId, currentVersionId: `SYNTHETIC-PHOTO-${slotId}`, caption: ["학교 정문", "급식실 출입구", "하역 공간"][index]!,
  status: "active", photoRevision: 1, createdAt: "2026-09-08T00:00:00.000Z", createdBy: "FIXTURE", updatedAt: "2026-09-08T00:00:00.000Z", updatedBy: "FIXTURE", deletedAt: null, deletedBy: null, deleteReason: null,
}));
function SchoolPhotosFixture() {
  const [mounted, setMounted] = useState(true);
  useEffect(() => {
    const clear = () => setMounted(false);
    window.addEventListener("fixture:clear-private-view", clear);
    return () => window.removeEventListener("fixture:clear-private-view", clear);
  }, []);
  return <main className="workspace-shell" data-mode="delivery" style={{ padding: 16, maxWidth: 900, margin: "auto" }}><h1>학교 현장 사진</h1>
    <button type="button" style={{ minHeight: 44 }} onClick={() => setMounted(true)}>사진 다시 표시</button>
    {mounted ? <SchoolPhotoGallery schoolId="SYNTHETIC-SCHOOL" photos={schoolPhotos} sessionNamespace="SYNTHETIC-SESSION" canEdit={false} onRefresh={() => undefined} /> : <p>비공개 사진이 닫혔습니다.</p>}
  </main>;
}
const syntheticSchool: School = {
  schoolId: "SYNTHETIC-SCHOOL", source: { provider: "NEIS", schoolCode: "SYNTHETIC-CODE", educationOfficeCode: "G10", syncedAt: null },
  name: "대전온누리초등학교", shortName: null, normalizedName: "대전온누리초등학교", initials: "ㄷㅈㅇㄴㄹㅊㄷㅎㄱ", aliases: [], schoolType: "elementary", district: "seo",
  address: { road: "대전광역시 서구 검증로 100", jibun: null, postalCode: "35200" }, phone: "042-555-1234", homepage: null,
  location: { latitude: 36.35, longitude: 127.38, kakaoPlaceId: null, matchStatus: "confirmed", matchMethod: "manual", matchConfidence: 1, matchedName: "대전온누리초등학교", matchedRoadAddress: "대전광역시 서구 검증로 100", matchedAt: null, confirmedBy: "FIXTURE", confirmedAt: "2026-09-08T00:00:00.000Z" },
  operationalStatus: "active", possibleRelocation: false, schoolBaseRevision: 1, createdAt: "2026-09-08T00:00:00.000Z", updatedAt: "2026-09-08T00:00:00.000Z",
};
const syntheticProfile: SchoolFieldProfile = {
  schoolId: syntheticSchool.schoolId, contacts: { dietitianPhone: "010-5555-1234", cafeteriaPhone: "042-555-5678" },
  cafeteria: { building: "급식동", floor: "1층", locationDescription: "정문에서 오른쪽 건물", entranceDescription: "파란 출입문", routeDescription: "운동장 바깥 통로 이용" },
  inspection: { startTime: "07:30", endTime: "08:00", note: "교직원 출근 전 검수" },
  equipment: { cartRequired: "required", elevator: "available", stairsRequired: "required" },
  vehicle: { access: "limited", unloadingLocation: "보존해야 하는 기존 하역정보", parking: "unavailable", note: "보존해야 하는 기존 차량정보" },
  fieldNotes: "출입문은 배송 후 닫아주세요.", completeness: 100, reviewRequired: false, revision: 7,
  createdAt: "2026-09-08T00:00:00.000Z", createdBy: "FIXTURE", updatedAt: "2026-09-08T00:00:00.000Z", updatedBy: "FIXTURE",
};
declare global {
  interface Window {
    schoolDetailFixture: { profile: SchoolFieldProfile | null; photos: SchoolPhoto[]; salesData?: CachedSchoolDetail["salesData"]; saves: { schoolId: string; expectedRevision: number; patch: SchoolFieldProfilePatch }[]; holdSave?: boolean; rejectSave?: boolean; releaseSave?: () => void };
  }
}
const syntheticSalesData: NonNullable<CachedSchoolDetail["salesData"]> = {
  activeCycleId: "2026-09", promotedProductNames: [],
  assignment: { schoolId: "SYNTHETIC-SCHOOL", cycleId: "2026-09", zoneId: null, primaryAssigneeId: "FIXTURE", assigneeIds: ["FIXTURE"], monthlyStatus: "before", latestVisitId: null, latestVisitedAt: null, brochureStatus: "unknown", sampleStatus: "unknown", revision: 1, createdAt: "2026-09-08T00:00:00.000Z", updatedAt: "2026-09-08T00:00:00.000Z" },
  profile: null, products: [], communicationTags: [], activityTags: [], employees: [], employeeDirectory: [],
};
window.schoolDetailFixture = { profile: structuredClone(syntheticProfile), photos: schoolPhotos.slice(0, 1), salesData: kind === "sales-detail" ? structuredClone(syntheticSalesData) : null, saves: [] };
function DeliverySchoolFixture() {
  const [mode, setMode] = useState<"delivery" | "sales">(kind === "sales-detail" ? "sales" : "delivery");
  const [schoolType, setSchoolType] = useState<School["schoolType"]>("elementary");
  const [readOnly, setReadOnly] = useState(false);
  const [hasSchoolPhone, setHasSchoolPhone] = useState(true);
  const names = { elementary: "대전온누리초등학교", middle: "대전온누리중학교", high: "대전온누리고등학교", special: "온누리특수학교", other: "온누리학교" };
  const session = { uid: "SYNTHETIC-DELIVERY", displayName: "검증 직원", claims: { employeeId: "FIXTURE", roleScopes: readOnly ? [] : [mode], sessionVersion: 1, permissionsVersion: 1 } } as AuthenticatedSession;
  return <div className="workspace-shell" data-mode={mode}><div className="aurora-background" aria-hidden="true"><i /><i /><i /></div>
    <div role="group" aria-label="학교 화면 검증 설정" style={{ padding: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
      <label>검증 학교급<select value={schoolType} onChange={(event) => setSchoolType(event.target.value as School["schoolType"])}>{Object.entries(names).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <button type="button" onClick={() => setReadOnly((value) => !value)}>{readOnly ? "편집 권한 켜기" : "조회 전용으로 전환"}</button>
      <button type="button" onClick={() => { window.schoolDetailFixture.profile = null; window.dispatchEvent(new Event("fixture:detail-changed")); }}>미등록 상태로 전환</button>
      {kind === "sales-detail" ? <><button type="button" onClick={() => setMode((value) => value === "sales" ? "delivery" : "sales")}>{mode === "sales" ? "학교납품으로 전환" : "영업홍보로 전환"}</button><button type="button" onClick={() => { window.schoolDetailFixture.salesData = null; window.dispatchEvent(new Event("fixture:detail-changed")); }}>배정 정보 없이 보기</button><button type="button" onClick={() => {
        setHasSchoolPhone(false);
        if (window.schoolDetailFixture.profile) window.schoolDetailFixture.profile = { ...window.schoolDetailFixture.profile, contacts: { dietitianPhone: null, cafeteriaPhone: null } };
        window.dispatchEvent(new Event("fixture:detail-changed"));
      }}>연락처 없이 보기</button></> : null}
    </div><main><SchoolDetail key={`${mode}:${schoolType}`} school={{ ...syntheticSchool, schoolType, name: names[schoolType], phone: hasSchoolPhone ? syntheticSchool.phone : null }} session={session} mode={mode} /></main>
  </div>;
}
createRoot(document.getElementById("root")!).render(kind === "picker" ? <PickerFixture /> : kind === "directory" ? <DirectoryFixture /> : kind === "school-photos" ? <StrictMode><ToastProvider><SchoolPhotosFixture /></ToastProvider></StrictMode> : kind === "school-detail" || kind === "sales-detail" ? <ToastProvider><DeliverySchoolFixture /></ToastProvider> : <Fixture />);
