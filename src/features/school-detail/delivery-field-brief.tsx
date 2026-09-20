import { Icon } from "@/components/ui/icon";
import type { SchoolFieldProfile } from "@/domain/school";
import { formatPhoneNumber } from "@/lib/phone-number";

import styles from "./delivery-field-brief.module.css";

export function inspectionTimeLabel(inspection: SchoolFieldProfile["inspection"]) {
  const { startTime, endTime } = inspection;
  if (startTime && endTime) return `${startTime} – ${endTime}`;
  if (startTime) return `${startTime}부터`;
  if (endTime) return `${endTime}까지`;
  return "시간 미등록";
}

/** One readable brief; retired vehicle/stair data never participates in presentation. */
export function DeliveryFieldBrief({ profile, schoolPhone, canEdit, onEdit }: {
  profile: SchoolFieldProfile;
  schoolPhone: string | null;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const contacts = [
    { label: "영양사 선생님", phone: profile.contacts.dietitianPhone },
    { label: "급식실", phone: profile.contacts.cafeteriaPhone },
    { label: "학교 대표", phone: schoolPhone },
  ].flatMap(({ label, phone }) => phone ? [{ label, phone }] : []);
  return (
    <section className={styles.brief} aria-labelledby="field-workspace-title" data-delivery-brief>
      <header className={styles.heading}>
        <h2 id="field-workspace-title">납품 현장정보</h2>
        {canEdit ? <button className={styles.edit} type="button" onClick={onEdit}><Icon name="clipboard" size={16} />정보 수정</button> : null}
      </header>
      <div className={styles.inspection}>
        <span className={styles.label}><Icon name="clock" size={18} />검수시간</span>
        <strong data-missing={!profile.inspection.startTime && !profile.inspection.endTime}>{inspectionTimeLabel(profile.inspection)}</strong>
        {profile.inspection.note ? <p>{profile.inspection.note}</p> : null}
      </div>
      <div className={styles.location}>
        <h3 className={styles.label}><Icon name="location" size={18} />급식실 위치</h3>
        <CafeteriaLocation cafeteria={profile.cafeteria} />
      </div>
      <dl className={styles.equipment} aria-label="납품 장비">
        <div><dt>대차</dt><dd data-unknown={profile.equipment.cartRequired === "unknown"}>{({ required: "필요", notRequired: "불필요", unknown: "미확인" })[profile.equipment.cartRequired]}</dd></div>
        <div><dt>엘리베이터</dt><dd data-unknown={profile.equipment.elevator === "unknown"}>{({ available: "있음", unavailable: "없음", unknown: "미확인" })[profile.equipment.elevator]}</dd></div>
      </dl>
      {profile.fieldNotes ? <div className={styles.note}>
        <h3 className={styles.label}><Icon name="clipboard" size={18} />현장 참고</h3>
        <p>{profile.fieldNotes}</p>
      </div> : null}
      {contacts.length ? <div className={styles.contacts} aria-label="학교 연락처">
        {contacts.map(({ label, phone }) => <a key={label} href={`tel:${phone.replace(/(?!^)\+|[^\d+]/gu, "")}`} aria-label={`${label} ${formatPhoneNumber(phone)} 전화`}>
          <span><small>{label}</small><strong>{formatPhoneNumber(phone)}</strong></span>
          <span className={styles.call}><Icon name="phone" size={17} />전화</span>
        </a>)}
      </div> : null}
    </section>
  );
}

function CafeteriaLocation({ cafeteria }: { cafeteria: SchoolFieldProfile["cafeteria"] | null }) {
  const place = [cafeteria?.building, cafeteria?.floor].filter(Boolean).join(" · ");
  return (
    <>
      <strong>{place || cafeteria?.locationDescription || "위치 미등록"}</strong>
      {place && cafeteria?.locationDescription ? <p>{cafeteria.locationDescription}</p> : null}
      {cafeteria?.entranceDescription || cafeteria?.routeDescription ? <dl className={styles.route}>
        {cafeteria.entranceDescription ? <div><dt>출입구</dt><dd>{cafeteria.entranceDescription}</dd></div> : null}
        {cafeteria.routeDescription ? <div><dt>이동 동선</dt><dd>{cafeteria.routeDescription}</dd></div> : null}
      </dl> : null}
    </>
  );
}

/** Sales uses the shared location layout without delivery-only equipment or times. */
export function SchoolLocationBrief({ profile, canEdit, onEdit }: {
  profile: SchoolFieldProfile | null;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const elevator = profile?.equipment.elevator ?? "unknown";
  return (
    <section className={styles.brief} aria-labelledby="sales-location-title" data-sales-location-brief>
      <header className={styles.heading}>
        <h2 id="sales-location-title">급식실 위치</h2>
        {canEdit ? <button className={styles.edit} type="button" onClick={onEdit}><Icon name="location" size={16} />위치 수정</button> : null}
      </header>
      <div className={styles.location} data-field-location><CafeteriaLocation cafeteria={profile?.cafeteria ?? null} /></div>
      <dl className={styles.equipment} data-field-elevator>
        <div><dt>엘리베이터</dt><dd data-unknown={elevator === "unknown"}>{({ available: "있음", unavailable: "없음", unknown: "미확인" })[elevator]}</dd></div>
      </dl>
    </section>
  );
}
