import { FirebaseError } from "firebase/app";
export { pinChangeErrorMessage } from "../../../src/features/auth/pin-change-repository";

type Control = {
  pinMode: "success" | "duplicate" | "uncertain" | "hold";
  pinCalls: { requestId: string }[];
  resolvePin: () => void;
  googleMode: "success" | "duplicate" | "hold";
  failList: boolean;
  googleCalls: { requestId: string; email?: string; employeeId?: string }[];
  resolveGoogle: () => void;
};
export const control: Control = {
  pinMode: "success", pinCalls: [], resolvePin: () => {},
  googleMode: "success", failList: false, googleCalls: [], resolveGoogle: () => {},
};
declare global { interface Window { accessFixture: Control } }
window.accessFixture = control;
export async function changeEmployeePin(input: { requestId: string }) {
  control.pinCalls.push({ requestId: input.requestId });
  if (control.pinMode === "duplicate") throw new FirebaseError("functions/already-exists", "사용 중");
  if (control.pinMode === "uncertain") { control.pinMode = "success"; throw new Error("Synthetic response loss"); }
  if (control.pinMode === "hold") await new Promise<void>((resolve) => { control.resolvePin = resolve; });
}
let revision = 3;
const entries = [
  { employeeId: "FIXTURE-ADMIN", displayName: "검증 운영자", email: "owner@example.test", status: "active" },
  { employeeId: "FIXTURE-GOOGLE", displayName: "검증 책임자", email: "responsible-person.with-long-address@example.test", status: "pending" },
];
export const googleAdminRepository = {
  async list() {
    if (control.failList) throw new Error("Synthetic list failure");
    return { revision, entries: entries.map((entry) => ({ ...entry })) };
  },
  async register(input: { requestId: string; email: string; displayName: string }) {
    control.googleCalls.push({ requestId: input.requestId, email: input.email });
    if (control.googleMode === "duplicate") throw new FirebaseError("functions/already-exists", "이미 등록된 Google 이메일입니다.");
    if (control.googleMode === "hold") await new Promise<void>((resolve) => { control.resolveGoogle = resolve; });
    entries.push({ employeeId: `FIXTURE-${++revision}`, displayName: input.displayName, email: input.email, status: "pending" });
    return { employeeId: `FIXTURE-${revision}`, revision };
  },
  async disable(input: { requestId: string; employeeId: string }) {
    control.googleCalls.push({ requestId: input.requestId, employeeId: input.employeeId });
    const entry = entries.find((entry) => entry.employeeId === input.employeeId);
    if (entry) entry.status = "disabled";
    return { employeeId: input.employeeId, revision: ++revision };
  },
};
