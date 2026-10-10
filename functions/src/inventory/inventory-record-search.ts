import { createHash } from "node:crypto";
import { FieldPath, Timestamp, type Firestore, type Query } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";
import { INVENTORY_PRODUCT_PATH, inventoryDateSchema, inventoryEventSchema, inventoryIdSchema, inventoryLocationSchema } from "./inventory-contract.js";
import { datesFromDocument } from "./inventory-document-codec.js";
import { getAdminFirestore } from "../shared/firebase-admin.js";
import { observeRead } from "../shared/read-observation.js";

const recordEvent = inventoryEventSchema.extend({ actorEmployeeId: inventoryIdSchema.nullish().default(null) });
const cursor = z.object({ at: z.iso.datetime(), productId: inventoryIdSchema, eventId: z.uuid(),
  asOf: z.iso.datetime(), filterHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const inventoryRecordInput = z.object({
  employeeId: inventoryIdSchema.optional(), employeeName: z.string().trim().min(2).max(100).optional(),
  productId: inventoryIdSchema.optional(), locationId: inventoryLocationSchema.optional(),
  kind: z.enum(["count_match", "count_adjust", "receive", "issue", "adjust", "transfer", "lot_update", "all"]).default("count_match"),
  fromDate: inventoryDateSchema, throughDate: inventoryDateSchema,
  limit: z.number().int().min(1).max(100).default(30), after: cursor.optional(),
  includeLines: z.boolean().default(false),
  includeRecords: z.boolean().default(true).describe("직원·창고별 건수만 필요하면 false. 원본 이력 읽기 수는 같지만 상품 이름 읽기와 개별 행 응답을 생략합니다."),
}).strict().refine((v) => !(v.employeeId && v.employeeName), "직원 이름과 ID 중 하나를 지정하세요.")
  .refine((v) => v.fromDate <= v.throughDate && (Date.parse(v.throughDate) - Date.parse(v.fromDate)) / 86_400_000 <= 92,
    "날짜 범위는 시작일부터 최대93일입니다.");
export type InventoryRecordInput = z.infer<typeof inventoryRecordInput>;
/** Direct original-event query. No catalog walk, copied history or author lookup per product. */
export class InventoryRecordSearch {
  constructor(private readonly db: Firestore = getAdminFirestore(), private readonly now: () => Date = () => new Date()) {}
  async productNames(ids: string[]) {
    const unique = [...new Set(ids)];
    if (!unique.length) return new Map<string, { name: string | null; status: string | null }>();
    const records = await observeRead("firestore", () => this.db.getAll(...unique.map((id) => this.db.doc(`${INVENTORY_PRODUCT_PATH}/${id}`)),
      { fieldMask: ["name", "status"] }), (v) => v.length);
    return new Map(records.map((doc) => [doc.id, { name: typeof doc.get("name") === "string" ? doc.get("name") as string : null,
      status: typeof doc.get("status") === "string" ? doc.get("status") as string : null }]));
  }
  async search(input: InventoryRecordInput) {
    const kinds = input.kind === "all" ? inventoryEventSchema.shape.kind.options : [input.kind];
    const filterHash = createHash("sha256").update(JSON.stringify([input.employeeId ?? null, input.productId ?? null,
      input.locationId ?? null, input.kind, input.fromDate, input.throughDate])).digest("hex");
    const asOf = input.after?.asOf ?? this.now().toISOString();
    if (input.after && (input.after.filterHash !== filterHash || Date.parse(asOf) > this.now().getTime())) throw new HttpsError("invalid-argument", "Cursor conditions differ");
    const from = Timestamp.fromDate(new Date(`${input.fromDate}T00:00:00+09:00`));
    const end = Math.min(Date.parse(`${input.throughDate}T00:00:00+09:00`) + 86_400_000, Date.parse(asOf) + 1);
    let query: Query = this.db.collectionGroup("events").where("kind", "in", kinds);
    for (const [field, value] of [["actorEmployeeId", input.employeeId], ["productId", input.productId], ["locationId", input.locationId]] as const) {
      if (value) query = query.where(field, "==", value);
    }
    query = query.where("createdAt", ">=", from).where("createdAt", "<", Timestamp.fromMillis(end))
      .orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc");
    if (input.after) query = query.startAfter(Timestamp.fromDate(new Date(input.after.at)),
      this.db.doc(`${INVENTORY_PRODUCT_PATH}/${input.after.productId}/events/${input.after.eventId}`));
    // Carry raw lines only when asked. Still project enough to validate original identity and event semantics.
    const fields = Object.keys(inventoryEventSchema.shape).filter((field) => !["lines", "reason", "lotMetadataChange"].includes(field));
    if (input.includeLines && input.includeRecords) fields.push("lines", "lotMetadataChange");
    const snapshot = await observeRead("firestore", () => query.select(...fields).limit(input.limit + 1).get(), (v) => v.docs.length);
    const documents = snapshot.docs.slice(0, input.limit);
    const events = documents.map((doc) => {
      const event = recordEvent.parse({ ...datesFromDocument(doc.data()), lines: doc.get("lines") ?? [], reason: "" });
      // A collection-group name alone is never a tenant boundary.
      if (doc.ref.path !== `${INVENTORY_PRODUCT_PATH}/${event.productId}/events/${event.eventId}` || doc.id !== event.eventId) {
        throw new HttpsError("failed-precondition", "Unexpected inventory event path");
      }
      return event;
    });
    const last = events.at(-1); const more = snapshot.docs.length > input.limit;
    return { events, asOf, nextCursor: more && last ? { at: last.createdAt, productId: last.productId, eventId: last.eventId, asOf, filterHash } : null,
      page: { returnedCount: events.length, complete: !more, hasMore: more, startedFromBeginning: !input.after,
        recordsScanned: snapshot.docs.length, pagesScanned: 1, stoppedBecause: more ? "result_limit" as const : "complete" as const } };
  }
}
