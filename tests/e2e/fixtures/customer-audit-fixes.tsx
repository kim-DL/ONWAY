import { createRoot } from "react-dom/client";
import { ToastProvider } from "@/components/ui/toast";
import { customerSchema, getCustomerChoseong, normalizeCustomerName, type Customer, type CustomerRegion } from "@/domain/customer";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { CustomerAdmin } from "@/features/customers/customer-admin";
import { CustomerWorkspace } from "@/features/customers/customer-workspace";
import { readCustomerWorkspaceSnapshot } from "@/features/customers/customer-workspace-snapshot";

const session = {
  uid: "AUDIT-USER", displayName: "합성 조사",
  claims: { employeeId: "AUDIT", sessionVersion: 1, permissionsVersion: 1, roleScopes: ["delivery", "admin"], adminApproved: true, signInProvider: "google.com" },
} as AuthenticatedSession;
const name = "합성감사 거래처";
const customer = customerSchema.parse({
  customerId: "AUDIT-CUSTOMER", companyId: "onnuri", name, normalizedName: normalizeCustomerName(name), choseongName: getCustomerChoseong(name),
  district: "서구", administrativeDong: "", officialAddress: "대전광역시 서구 합성로 1", deliveryAddress: "대전광역시 서구 합성로 1",
  accessPassword: "", accessPasswordState: "none", deliveryLocationDescription: "합성 조사 위치", deliveryPoint: { latitude: 36.35, longitude: 127.38 },
  contacts: [], status: "active", noticeType: "none", changeNote: "", revision: 1,
  createdAt: "2026-11-14T00:00:00.000Z", createdBy: "AUDIT", updatedAt: "2026-11-14T00:00:00.000Z", updatedBy: "AUDIT",
});

export interface CustomerAuditFixture {
  session: AuthenticatedSession;
  customers: Customer[];
  calls: Array<{ name: string; input: unknown }>;
  listFailure: boolean;
  holdList: boolean;
  nowOffset: number;
  pendingRegions: Array<(response: { data: CustomerRegion }) => void>;
  pendingLists: Array<() => void>;
  resolveRegions: () => void;
  peek: () => ReturnType<typeof readCustomerWorkspaceSnapshot>;
  call: (name: string, input: unknown) => Promise<unknown>;
  services: { auth: { currentUser: { uid: string } }; functions: object };
}
declare global { interface Window { customerAudit: CustomerAuditFixture } }

const audit: CustomerAuditFixture = window.customerAudit = {
  session, customers: [customer], calls: [], listFailure: false, holdList: false, nowOffset: 0, pendingRegions: [], pendingLists: [],
  resolveRegions() {
    for (const resolve of this.pendingRegions.splice(0)) resolve({ data: { district: "서구", administrativeDong: "둔산2동", address: customer.deliveryAddress } });
  },
  peek: () => readCustomerWorkspaceSnapshot("AUDIT-USER:1:1"),
  services: { auth: { currentUser: { uid: session.uid } }, functions: {} },
  async call(name, input) {
    this.calls.push({ name, input });
    if (name === "listCustomers") {
      if (this.holdList) await new Promise<void>((resolve) => this.pendingLists.push(resolve));
      if (this.listFailure) throw Object.assign(new Error("Synthetic transient read failure"), { code: "functions/unavailable" });
      return { data: { customers: this.customers, nextCursor: null } };
    }
    if (name === "reverseCustomerLocation") return new Promise((resolve) => this.pendingRegions.push(resolve));
    throw new Error(`Unexpected fixture callable ${name}`);
  },
};
const originalNow = Date.now;
Date.now = () => originalNow() + audit.nowOffset;
const admin = new URLSearchParams(location.search).has("admin");
createRoot(document.getElementById("root")!).render(<ToastProvider><main className="workspace-content">
  {admin ? <CustomerAdmin session={session} /> : <CustomerWorkspace session={session} requestedCustomerId={null} />}
</main></ToastProvider>);
