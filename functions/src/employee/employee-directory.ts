import { FieldPath, type Firestore, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { z } from "zod";
import { HttpsError } from "firebase-functions/v2/https";
import { verifyCustomerTransactionActor, type CustomerActor } from "../customer/customer-authorization.js";
import { getAdminFirestore } from "../shared/firebase-admin.js";
import { observeRead } from "../shared/read-observation.js";

const identity = z.object({ employeeId: z.string().min(1).max(128), displayName: z.string().trim().min(1).max(120) });
export type EmployeeIdentity = z.infer<typeof identity>;
/** Indexed directory projection for shared business reads; never exposes Auth/PIN/admin data. */
export class EmployeeDirectory {
  constructor(private readonly db: Firestore = getAdminFirestore()) {}
  /** Internal projection; callers must enforce authorization before reading and before releasing data.
   * Historical authors can be inactive. Names are current directory names, never historical snapshots.
   */
  async namesByIds(employeeIds: string[]): Promise<Map<string, string | null>> {
    const ids = [...new Set(employeeIds)];
    if (employeeIds.length > 100 || ids.some((id) => !/^[A-Za-z0-9_-]{1,128}$/.test(id))) {
      throw new HttpsError("invalid-argument", "기록자 식별자를 확인해주세요.");
    }
    if (ids.length === 0) return new Map();
    const records = await observeRead("firestore", () => this.db.getAll(...ids.map((id) => this.db.doc(`employees/${id}`)),
      { fieldMask: ["displayName"] }), (value) => value.length);
    return new Map(records.map((record) => {
      const name = identity.shape.displayName.safeParse(record.get("displayName"));
      return [record.id, record.exists && name.success ? name.data : null];
    }));
  }
  private async verify(actor: CustomerActor) {
    await this.db.runTransaction(async (transaction) => { await verifyCustomerTransactionActor(this.db, transaction, actor); });
  }
  async resolve(input: { employeeId?: string | undefined; employeeName?: string | undefined }, actor: CustomerActor) {
    await this.verify(actor);
    let candidates: EmployeeIdentity[]; let complete = true;
    if (input.employeeId) {
      const record = await observeRead("firestore", () => this.db.doc(`employees/${input.employeeId}`).get());
      candidates = record.exists ? [identity.parse({ employeeId: record.id, displayName: record.get("displayName") })] : [];
    } else {
      // displayName already has a single-field index. Prefix lookup also accepts a name before its title.
      const name = input.employeeName!.trim();
      const chars = Array.from(name);
      while (chars.length && chars.at(-1)!.codePointAt(0) === 0x10ffff) chars.pop();
      const last = chars.pop();
      const end = last ? chars.join("") + String.fromCodePoint(last.codePointAt(0)! + 1) : null;
      let query = this.db.collection("employees").where("displayName", ">=", name);
      if (end) query = query.where("displayName", "<", end);
      const snapshot = await observeRead("firestore", () => query.orderBy("displayName").orderBy(FieldPath.documentId())
        .select("displayName").limit(21).get(), (value) => value.docs.length);
      complete = snapshot.docs.length <= 20;
      candidates = snapshot.docs.slice(0, 20).map((record: QueryDocumentSnapshot) => identity.parse({ employeeId: record.id, displayName: record.get("displayName") }));
    }
    await this.verify(actor);
    return { employee: complete && candidates.length === 1 ? candidates[0]! : null, candidates, complete };
  }
}
