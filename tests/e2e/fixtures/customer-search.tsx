import { createRoot } from "react-dom/client";

import { getCustomerChoseong, normalizeCustomerName, type Customer } from "../../../src/domain/customer";
import type { AuthenticatedSession } from "../../../src/features/auth/auth-context";
import { CustomerWorkspace } from "../../../src/features/customers/customer-workspace";

const customers: Customer[] = ["온누리유통", "온누리식품", "온누리푸드 대전직영물류센터", "마음담은식품"].map((name, index) => ({
  customerId: `SEARCH-FIXTURE-${index}`, companyId: "onnuri", name, normalizedName: normalizeCustomerName(name), choseongName: getCustomerChoseong(name),
  district: "서구", administrativeDong: "둔산1동", officialAddress: "대전광역시 서구 둔산로 100", deliveryAddress: "대전광역시 서구 둔산로 100",
  accessPassword: "", accessPasswordState: "none", deliveryLocationDescription: "건물 뒤편 흰색 셔터 앞",
  deliveryPoint: { latitude: 36.35, longitude: 127.38 },
  contacts: [{ id: "CONTACT", name: "김소은 부장", role: "", phoneNumber: "010-1234-5678", isPrimary: true }],
  status: "active", noticeType: "normal", changeNote: "", revision: 1,
  createdAt: "2026-09-06T00:00:00.000Z", updatedAt: "2026-09-06T00:00:00.000Z", createdBy: "EMP", updatedBy: "EMP", overviewPhoto: null,
}));

// Data hooks alone are replaced: the workspace, home, search, cards and styles
// below are the production components, without any access to operating data.
(window as unknown as { customerSearchFixtures: Customer[] }).customerSearchFixtures = customers;
const session = { uid: "FIXTURE", displayName: "김대인 부장", claims: { employeeId: "FIXTURE", companyId: "onnuri", sessionVersion: 1, permissionsVersion: 1 } } as AuthenticatedSession;
const root = createRoot(document.getElementById("root")!);
let workspaceVersion = 0;
function renderWorkspace() { root.render(
  <main className="workspace-shell" data-mode="customer">
    <div className="aurora-background" aria-hidden="true"><i /><i /><i /></div>
    <div aria-hidden="true" style={{ height: 120, padding: "24px 20px", fontWeight: 700 }}>온누리종합식품</div>
    <div className="workspace-content"><CustomerWorkspace key={workspaceVersion} session={session} /></div>
  </main>,
); }
(window as unknown as { remountCustomerSearchFixture: () => void }).remountCustomerSearchFixture = () => { workspaceVersion += 1; renderWorkspace(); };
renderWorkspace();
