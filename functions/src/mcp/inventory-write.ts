import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { Timestamp, type Firestore, type Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";
import { InventoryService, type InventoryStockCommand } from "../inventory/inventory-service.js";
import { assertInventoryAccess } from "../inventory/inventory-authorization.js";
import { INVENTORY_PRODUCT_PATH, INVENTORY_SETTINGS_PATH, inventoryEventSchema, inventoryIdSchema, inventoryLocationSchema, inventoryLotDraftSchema,
  inventoryQuantitySchema, type InventoryMutationResult } from "../inventory/inventory-contract.js";
import { getAdminFirestore } from "../shared/firebase-admin.js";
import { observeRead, observeWrite } from "../shared/read-observation.js";
import type { McpPrincipal } from "./authorization.js";
import { hash } from "./oauth.js";

const common = { requireWriteAccess: z.boolean().default(false).describe("실제 변경 요청은 true로 먼저 쓰기 권한 동의를 확인. 단순 미리보기는 false이며 저장하지 않음."), productId: inventoryIdSchema, locationId: inventoryLocationSchema,
  reason: z.string().trim().max(500).default("") };
export const inventoryChangeInput = z.discriminatedUnion("action", [
  z.object({ ...common, action: z.literal("count_match") }).strict(),
  z.object({ ...common, action: z.literal("count_adjust"), reason: z.string().trim().min(1).max(500),
    counts: z.array(z.object({ lotId: inventoryIdSchema, quantity: inventoryQuantitySchema }).strict()).max(200) }).strict(),
  z.object({ ...common, action: z.literal("receive"), quantity: inventoryQuantitySchema.positive(),
    lotId: inventoryIdSchema.optional(), newLot: inventoryLotDraftSchema.optional() }).strict(),
  z.object({ ...common, action: z.literal("issue"), quantity: inventoryQuantitySchema.positive(), lotId: inventoryIdSchema.optional() }).strict(),
  z.object({ ...common, action: z.literal("adjust"), quantity: inventoryQuantitySchema, lotId: inventoryIdSchema.optional(), reason: z.string().trim().min(1).max(500) }).strict(),
  z.object({ ...common, action: z.literal("transfer"), quantity: inventoryQuantitySchema.positive(), lotId: inventoryIdSchema.optional(), toLocationId: inventoryLocationSchema }).strict(),
  z.object({ ...common, action: z.literal("update_lot"), lotId: inventoryIdSchema, draft: inventoryLotDraftSchema, reason: z.string().trim().min(1).max(500) }).strict(),
]);
export const approvalInput = z.object({ planId: z.uuid(), approvalToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();
export const inventoryPreviewResult = z.object({ status: z.literal("ok"), state: z.literal("awaiting_approval"), planId: z.uuid(),
  action: z.string(), productName: z.string(), unitLabel: z.string(), locationId: inventoryLocationSchema, validUntil: z.iso.datetime(),
  before: z.record(inventoryLocationSchema, inventoryQuantitySchema), after: z.record(inventoryLocationSchema, inventoryQuantitySchema),
  lines: inventoryEventSchema.shape.lines, lotMetadataChange: inventoryEventSchema.shape.lotMetadataChange.unwrap().nullable(),
  reason: z.string(), canWrite: z.boolean(), note: z.string() }).strict();
export interface InventoryWriteAuthorization {
  binding: string;
  canWrite: boolean;
  check(transaction: Transaction): Promise<void>;
}
const PLAN_MS = 5 * 60_000;
const RETENTION_MS = 24 * 60 * 60_000;
type Plan = { actor: McpPrincipal; binding: string; approvalHash: string; command: InventoryStockCommand;
  productVersion: string; settingsVersion: string; validUntil: number; expiresAtTTL: Timestamp };
const version = (snapshot: { exists: boolean; updateTime?: Timestamp }) => snapshot.exists ? snapshot.updateTime?.valueOf() ?? "missing-version" : "absent";
export const inventoryCommitResult = z.object({ status: z.literal("ok"), state: z.literal("committed"), planId: z.uuid(),
  productId: inventoryIdSchema, productName: z.string(), kind: z.string(), registeredAt: z.iso.datetime(),
  unitLabel: z.string(), quantityByLocation: z.record(inventoryLocationSchema, inventoryQuantitySchema),
  replayed: z.boolean(), note: z.string() }).strict();
function resultProjection(planId: string, result: InventoryMutationResult) {
  return inventoryCommitResult.parse({ status: "ok", state: "committed", planId, productId: result.product.productId,
    productName: result.product.name, kind: result.event.kind, registeredAt: result.event.createdAt,
    unitLabel: result.product.unitLabel, quantityByLocation: result.product.quantityByLocation, replayed: result.replayed,
    note: result.replayed ? "이 승인은 이미 저장되어 중복 적용하지 않았습니다. 수량은 당시 저장 결과이며 현재 수량 재조회가 아닙니다."
      : "기존 급식길 재고·실사 이력과 감사 기록에 저장했습니다. 수량은 저장 시점 기준입니다." });
}
/** OAuth/UI orchestration only. All stock calculation, authorization and writes remain in InventoryService. */
export class McpInventoryWrites {
  constructor(private readonly db: Firestore = getAdminFirestore(), private readonly inventory = new InventoryService(db),
    private readonly now: () => number = Date.now) {}
  async preview(raw: z.infer<typeof inventoryChangeInput>, actor: McpPrincipal, authorization: InventoryWriteAuthorization) {
    assertInventoryAccess(actor, "write");
    const input = inventoryChangeInput.parse(raw);
    if (input.requireWriteAccess && !authorization.canWrite) {
      throw new HttpsError("permission-denied", "Write consent required", { reason: "mcp-write-consent" });
    }
    // Capture versions before reading the working set; preview validates these inside its transaction.
    const snapshots = await observeRead("firestore", () => this.db.getAll(this.db.doc(`${INVENTORY_PRODUCT_PATH}/${input.productId}`),
      this.db.doc(INVENTORY_SETTINGS_PATH)), (value) => value.length);
    const productVersion = version(snapshots[0]!); const settingsVersion = version(snapshots[1]!);
    const [detail, context] = await Promise.all([this.inventory.detail(input.productId, actor), this.inventory.context()]);
    const requestId = randomUUID();
    const shared = { requestId, productId: input.productId, expectedStockRevision: detail.product.stockRevision, reason: input.reason };
    const lots = detail.lots.filter((lot) => lot.locationId === input.locationId);
    let command: InventoryStockCommand;
    if (input.action === "count_match" || input.action === "count_adjust") {
      command = { operation: "count", input: { ...shared, locationId: input.locationId, cycleId: context.cycle.cycleId,
        matchOnly: input.action === "count_match", counts: input.action === "count_match"
          ? lots.map(({ lotId, quantity }) => ({ lotId, quantity })) : input.counts } };
    } else if (input.action === "update_lot") {
      if (!lots.some((lot) => lot.lotId === input.lotId)) throw new HttpsError("invalid-argument", "Select a current lot at this location");
      command = { operation: "lot", input: { ...shared, lotId: input.lotId, draft: input.draft } };
    } else {
      const lotId = input.lotId ?? (input.action === "receive" ? null : lots.length === 1 ? lots[0]!.lotId : null);
      if (input.action !== "receive" && !lotId) throw new HttpsError("invalid-argument", "Select one lot; quantities cannot be allocated implicitly");
      command = { operation: "movement", input: { ...shared, kind: input.action, locationId: input.locationId, lotId,
        quantity: input.quantity, ...(input.action === "receive" && input.newLot ? { newLot: input.newLot } : {}),
        ...(input.action === "transfer" ? { toLocationId: input.toLocationId } : {}) } };
    }
    const result = await this.inventory.stockCommand(command, actor, { preview: true, before: async (tx) => {
      await this.checkVersions(tx, input.productId, productVersion, settingsVersion);
    } });
    const approvalToken = randomBytes(32).toString("base64url");
    const validUntil = this.now() + PLAN_MS;
    const plan: Plan = { actor, binding: authorization.binding, approvalHash: hash(approvalToken), command,
      productVersion, settingsVersion, validUntil, expiresAtTTL: Timestamp.fromMillis(this.now() + RETENTION_MS) };
    observeWrite(); await this.db.doc(`mcpPrivate/inventory-plan-${requestId}`).create(plan);
    const summary = { status: "ok" as const, state: "awaiting_approval" as const, planId: requestId,
      action: input.action, productName: detail.product.name, unitLabel: detail.product.unitLabel, locationId: input.locationId,
      validUntil: new Date(validUntil).toISOString(), before: detail.product.quantityByLocation, after: result.product.quantityByLocation,
      lines: result.event.lines, lotMetadataChange: result.event.lotMetadataChange ?? null, reason: input.reason,
      canWrite: authorization.canWrite, note: "아직 저장하지 않았습니다. 사용자가 미리보기의 승인 버튼을 눌러야 저장됩니다. 5분 이내 승인 가능하며 재고/상품/설정이 바뀌면 다시 미리보세요. 수량일치는 실제 수량 확인 후 승인하세요." };
    // Raw approval capability is UI-only metadata, never model-visible content/structuredContent.
    return { summary, approval: { planId: requestId, approvalToken } };
  }
  private async checkVersions(tx: Transaction, productId: string, productVersion: string, settingsVersion: string) {
    const records = await observeRead("firestore", () => tx.getAll(this.db.doc(`${INVENTORY_PRODUCT_PATH}/${productId}`),
      this.db.doc(INVENTORY_SETTINGS_PATH)), (value) => value.length);
    if (version(records[0]!) !== productVersion || version(records[1]!) !== settingsVersion) {
      throw new HttpsError("aborted", "Preview changed", { reason: "mcp-preview-stale" });
    }
  }
  async commit(raw: z.infer<typeof approvalInput>, actor: McpPrincipal, authorization: InventoryWriteAuthorization) {
    assertInventoryAccess(actor, "write");
    if (!authorization.canWrite) throw new HttpsError("permission-denied", "Write consent required", { reason: "mcp-write-consent" });
    const input = approvalInput.parse(raw);
    const ref = this.db.doc(`mcpPrivate/inventory-plan-${input.planId}`);
    const plan = (await observeRead("firestore", () => ref.get())).data() as Plan | undefined;
    const validate = (candidate: Plan | undefined) => {
      if (!candidate || candidate.binding !== authorization.binding || ["uid", "employeeId", "sessionVersion", "permissionsVersion", "isAdmin"].some((key) => candidate.actor[key as keyof McpPrincipal] !== actor[key as keyof McpPrincipal])
        || candidate?.actor.roleScopes.join(",") !== actor.roleScopes.join(",")
        || !timingSafeEqual(Buffer.from(candidate.approvalHash), Buffer.from(hash(input.approvalToken)))) {
        throw new HttpsError("permission-denied", "Invalid approval");
      }
    };
    validate(plan);
    const result = await this.inventory.stockCommand(plan!.command, actor, { before: async (tx, replayed) => {
      await authorization.check(tx);
      const current = (await observeRead("firestore", () => tx.get(ref))).data() as Plan | undefined;
      validate(current);
      if (!replayed) {
        if (current!.validUntil <= this.now()) throw new HttpsError("failed-precondition", "Approval expired", { reason: "mcp-preview-expired" });
        await this.checkVersions(tx, current!.command.input.productId, current!.productVersion, current!.settingsVersion);
      }
      // The canonical permanent receipt makes concurrent/delayed approval retries exactly-once.
      // No separate claim/lease can get stranded between this gate and the stock transaction.
    } });
    return resultProjection(input.planId, result);
  }
}
