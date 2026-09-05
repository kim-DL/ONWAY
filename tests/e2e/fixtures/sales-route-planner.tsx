import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BottomSheet } from "../../../src/components/ui/bottom-sheet";
import { SalesRoutePlanner, type SalesRouteCandidate } from "../../../src/features/sales-route/sales-route-planner";

const date = new Date("2026-09-05T00:00:00.000Z");
const count = Math.min(60, Math.max(2, Number(document.body.dataset.schoolCount ?? "40")));
const candidates: SalesRouteCandidate[] = Array.from({ length: count }, (_, index) => {
  const id = `SCHOOL-${index + 1}`;
  const name = index === 10 ? "대전선화초등학교" : index === 18 ? "대전외국어고등학교" : `동선검증${String(index + 1).padStart(2, "0")}초등학교`;
  return {
    school: { schoolId: id, name, schoolType: index === 18 ? "high" : "elementary", shortName: null,
      normalizedName: name, initials: "", aliases: [], district: "daedeok",
      source: { provider: "NEIS", schoolCode: id, educationOfficeCode: "G10", syncedAt: date },
      address: { road: `대전광역시 대덕구 대화로 ${index + 1}`, jibun: null, postalCode: null },
      phone: null, homepage: null, operationalStatus: "active", possibleRelocation: false,
      schoolBaseRevision: 1, createdAt: date, updatedAt: date,
      location: { latitude: 36.3 + index / 1000, longitude: 127.4, kakaoPlaceId: null,
        matchStatus: "confirmed", matchMethod: "manual", matchConfidence: 1,
        matchedName: name, matchedRoadAddress: null, matchedAt: date, confirmedBy: "ADMIN", confirmedAt: date } },
    assignment: { schoolId: id, cycleId: "2026-09", zoneId: null, primaryAssigneeId: "EMP-TEST",
      assigneeIds: ["EMP-TEST"], monthlyStatus: index % 5 === 4 ? "completed" : "before",
      latestVisitId: null, latestVisitedAt: null, brochureStatus: "unknown", sampleStatus: "unknown",
      revision: 1, createdAt: date, updatedAt: date },
  };
});

function Fixture() {
  const [open, setOpen] = useState(false);
  return <main className="workspace-shell" data-mode="sales">
    <h1>내 담당 학교</h1><button type="button" onClick={() => setOpen(true)}>방문 동선</button>
    <BottomSheet open={open} title="방문 동선" onClose={() => setOpen(false)}>
      <SalesRoutePlanner cycleId="2026-09" candidates={candidates} initialRoute={null} onApply={() => setOpen(false)} />
    </BottomSheet>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
