import { createRoot } from "react-dom/client";
import { CustomerCardDirectionsLink } from "../../../src/features/customers/customer-card";
import { CustomerDirectionsLink } from "../../../src/features/customers/customer-detail";
import { customerSchema } from "../../../src/domain/customer";
const customer = customerSchema.parse({ customerId: "fixture", companyId: "onnuri", name: "예시식품", normalizedName: "예시식품", choseongName: "ㅇㅅㅅㅍ",
  district: "대덕구", administrativeDong: "", officialAddress: "예전동 1", deliveryAddress: "대전 대덕구 예시로 38", deliveryPoint: { latitude: 37.1, longitude: 128.2 },
  accessPassword: "", accessPasswordState: "none", deliveryLocationDescription: "", contacts: [], status: "active", noticeType: "none", changeNote: "", revision: 1,
  createdAt: "2026-11-07T00:00:00Z", updatedAt: "2026-11-07T00:00:00Z", createdBy: "fixture", updatedBy: "fixture" });
createRoot(document.getElementById("root")!).render(<main><h1>주소 길안내 검증</h1><section aria-label="목록 카드"><CustomerCardDirectionsLink customer={customer} /></section><section aria-label="상세 화면"><CustomerDirectionsLink customer={{ ...customer, deliveryPoint: null }} /></section></main>);
