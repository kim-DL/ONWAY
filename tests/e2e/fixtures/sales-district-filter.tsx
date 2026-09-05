import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { School } from "../../../src/domain/school";
import { SalesDistrictFilter } from "../../../src/features/sales-cycle/sales-district-filter";
import { buildSalesDistrictOptions, type SalesDistrict } from "../../../src/features/sales-cycle/sales-district-filter-model";

const districts: School["district"][] = ["seo", "jung", "daedeok", "dong", "yuseong"];
const schools = Array.from({ length: 40 }, (_, index) => ({ schoolId: `school-${index}`, district: districts[index % districts.length] }));

function Fixture() {
  const [value, setValue] = useState<SalesDistrict>("all");
  const [scope, setScope] = useState(schools);
  const options = buildSalesDistrictOptions(scope, value);
  const visible = scope.filter((school) => value === "all" || school.district === value);
  return (
    <main id="district-fixture">
      <h1>내 담당 학교</h1>
      <button type="button" data-testid="before">필터 앞</button>
      <section aria-label="담당 학교">
        <SalesDistrictFilter options={options} value={value} onChange={setValue} />
        <output data-testid="selection">{value}:{visible.length}</output>
        <div className="fixture-results">
          {visible.slice(0, 3).map((school) => <article key={school.schoolId}><strong>온누리 담당 학교 {school.schoolId.slice(7)}</strong><small>{school.district}</small></article>)}
        </div>
      </section>
      <button type="button" data-testid="after">필터 뒤</button>
      <button type="button" onClick={() => setScope(schools.filter((school) => school.district === "seo"))}>서구 배정만 남기기</button>
      <button type="button" onClick={() => setScope(schools.filter((school) => ["seo", "jung", "daedeok"].includes(school.district)))}>3개 지역 배정</button>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
