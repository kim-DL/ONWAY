import { useState } from "react";
import { createRoot } from "react-dom/client";

import type { SalesAssignment } from "../../../src/domain/sales";
import type { School } from "../../../src/domain/school";
import { ActivityRow, AssignmentCard } from "../../../src/features/sales-cycle/sales-school-cards";

const date = new Date("2026-09-05T00:00:00.000Z");
const school = (id: string, name: string, schoolType: School["schoolType"]): School => ({
  schoolId: id, name, schoolType, shortName: null, normalizedName: name, initials: "", aliases: [],
  district: "daedeok", address: { road: "대전광역시 대덕구 대화로 242-36", jibun: null, postalCode: null },
  source: { provider: "NEIS", schoolCode: id, educationOfficeCode: "G10", syncedAt: date },
  phone: null, homepage: null, operationalStatus: "active", possibleRelocation: false,
  schoolBaseRevision: 1, createdAt: date, updatedAt: date,
  location: { latitude: null, longitude: null, kakaoPlaceId: null, matchStatus: "unmatched",
    matchMethod: null, matchConfidence: null, matchedName: null, matchedRoadAddress: null,
    matchedAt: null, confirmedBy: null, confirmedAt: null },
});
const assignment = (value: School, status: SalesAssignment["brochureStatus"]): SalesAssignment => ({
  schoolId: value.schoolId, cycleId: "2026-09", zoneId: null, primaryAssigneeId: "EMP-TEST",
  assigneeIds: ["EMP-TEST"], monthlyStatus: "before", latestVisitId: null, latestVisitedAt: null,
  brochureStatus: status, sampleStatus: status, revision: 1, createdAt: date, updatedAt: date,
});
const schools = [
  school("elementary", "대전대화초등학교", "elementary"),
  school("middle", "가수원중학교", "middle"),
  school("high", "대전고등학교", "high"),
];
const longSchool = school("long", "대전온누리미래융합과학국제문화예술고등학교부설방송통신고등학교", "high");
const statuses = ["unknown", "notDelivered", "delivered"] as const;

function Fixture() {
  const [events, setEvents] = useState<string[]>([]);
  const [selected, setSelected] = useState(false);
  const [primary] = schools;
  if (!primary) throw new Error("Missing fixture school");
  const onSelect = (value: School) => setEvents((old) => [...old, `select:${value.schoolId}`]);
  return <main className="workspace-shell" data-mode="sales" id="card-fixture">
    <h1>담당 학교 카드 검증</h1>
    <section className="fixture-list" aria-label="담당 학교">
      {schools.map((value, index) => <div data-testid={`assignment-${value.schoolId}`} key={value.schoolId}>
        <AssignmentCard school={value} assignment={{ ...assignment(value, statuses[index] ?? "unknown"),
          ...(index === 2 ? { monthlyStatus: "completed", latestVisitId: "VISIT-TEST", latestVisitedAt: date } : {}) }}
          primaryName="김영업" onSelect={onSelect} />
      </div>)}
      <div data-testid="assignment-long"><AssignmentCard school={longSchool}
        assignment={{ ...assignment(longSchool, "delivered"), assigneeIds: ["EMP-TEST", "EMP-SECOND"],
          monthlyStatus: "followUp", latestVisitId: "VISIT-TEST", latestVisitedAt: date }}
        primaryName="이름이아주긴담당직원" routePosition={16} onSelect={onSelect} /></div>
    </section>
    <section className="fixture-list" aria-label="활동 학교">
      {schools.map((value, index) => <div data-testid={`activity-${value.schoolId}`} key={value.schoolId}>
        <ActivityRow item={{ school: value, assignment: assignment(value, statuses[index] ?? "unknown") }} onSelect={onSelect} />
      </div>)}
      <div data-testid="activity-long"><ActivityRow item={{ school: longSchool, assignment: assignment(longSchool, "delivered") }} onSelect={onSelect} /></div>
    </section>
    <section className="fixture-list" aria-label="담당 학교 정리">
      <div data-testid="manage-enabled"><AssignmentCard school={primary} assignment={assignment(primary, "unknown")}
        primaryName="김영업" managing releasable selected={selected} onSelect={onSelect}
        onToggle={(id, checked) => { setSelected(checked); setEvents((old) => [...old, `toggle:${id}:${checked}`]); }} /></div>
      <div data-testid="manage-disabled"><AssignmentCard school={schools[1]!} assignment={assignment(schools[1]!, "delivered")}
        primaryName="김영업" managing releasable={false} onSelect={onSelect}
        onToggle={() => setEvents((old) => [...old, "unexpected-disabled-toggle"])} /></div>
    </section>
    <output aria-label="검증 이벤트" data-testid="events">{events.join("|")}</output>
  </main>;
}

createRoot(document.getElementById("root")!).render(<Fixture />);
