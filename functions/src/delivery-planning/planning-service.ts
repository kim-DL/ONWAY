import { createHash, randomUUID } from "node:crypto";
import { Timestamp, type Firestore, type Transaction, type DocumentData } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import type { z } from "zod";
import { verifyCustomerTransactionActor, type CustomerActor } from "../customer/customer-authorization.js";
import { CUSTOMER_COLLECTION_PATH } from "../customer/customer-contract.js";
import { deliveryDateKeyInSeoul } from "../delivery-photo/delivery-photo-service.js";
import { DELIVERY_PHOTO_DAY_PATH, DELIVERY_PHOTO_PATH, DELIVERY_PHOTO_ROUTE_PATH } from "../delivery-photo/delivery-photo-store.js";
import { deliveryPhotoDayResultSchema, deliveryPhotoRouteSchema } from "../delivery-photo/delivery-photo-contract.js";
import { getAdminFirestore } from "../shared/firebase-admin.js";
import { matchInvoice, type MatchCustomer } from "./invoice-matching.js";
import { invoiceImage, type PlanningProviders } from "./planning-providers.js";
import { customerRouteAddress, resolveRegisteredStops } from "./registered-address.js";
import {
  DEFAULT_ORIGIN_ADDRESS, DEFAULT_ORIGIN_POINT, DEFAULT_DELIVERY_VEHICLE, PLANNING_NOTICE, invoiceResultSchema, planningSettingsSchema, routeRecommendationSchema,
  type analyzeInvoiceSchema, type confirmInvoiceSchema, type recommendRouteSchema, type applyRecommendationSchema,
  type savePlanningSettingsSchema, type InvoiceResult, type PlanningSettings, type PlanningLists,
} from "./planning-contract.js";

const SETTINGS = "secureSettings/deliveryPlanning";
const lockPath = (requestId: string) => `requestLocks/delivery-planning-${requestId}`;
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const conflict = () => new HttpsError("aborted", "오늘 목록이나 설정이 바뀌었습니다. 최신 목록을 확인한 뒤 다시 진행해주세요.");
const unique = (ids: string[]) => [...new Set(ids)];
const iso = (value: unknown) => value instanceof Timestamp ? value.toDate().toISOString() : value;
function routeValue(data: DocumentData | undefined) {
  return data ? deliveryPhotoRouteSchema.parse({ ...data, updatedAt: iso(data.updatedAt) }) : null;
}
function settingsValue(data: DocumentData | undefined): PlanningSettings {
  // Vehicle configuration is server-owned, including legacy unset/custom values.
  return planningSettingsSchema.parse({
    originAddress: data?.originAddress ?? DEFAULT_ORIGIN_ADDRESS, originPoint: data ? data.originPoint ?? null : DEFAULT_ORIGIN_POINT,
    vehicle: DEFAULT_DELIVERY_VEHICLE, revision: data?.revision ?? null,
  });
}

export class PlanningService {
  constructor(private readonly providers: PlanningProviders, private readonly db: Firestore = getAdminFirestore(), private readonly clock: () => Timestamp = Timestamp.now) {}
  private today(key: string) {
    if (key !== deliveryDateKeyInSeoul(this.clock().toDate())) throw new HttpsError("failed-precondition", "날짜가 바뀌었습니다. 오늘 목록을 새로 열어주세요.");
  }
  private audit(tx: Transaction, actor: CustomerActor, eventType: string, requestId: string, details: Record<string, unknown> = {}) {
    const logId = randomUUID();
    tx.create(this.db.doc(`auditLogs/${logId}`), { logId, eventType, actorUid: actor.uid, actorEmployeeId: actor.employeeId,
      targetType: "deliveryPlanning", targetId: actor.employeeId, companyId: "onnuri", requestId, createdAt: this.clock(), ...details });
  }
  private async authorize(tx: Transaction, actor: CustomerActor) { await verifyCustomerTransactionActor(this.db, tx, actor); }
  private checkReceipt(data: DocumentData, actor: CustomerActor, operation: string, hash: string) {
    if (data.actorUid !== actor.uid || data.employeeId !== actor.employeeId || data.operation !== operation || data.fingerprint !== hash) {
      throw new HttpsError("already-exists", "다른 입력에 사용된 요청입니다. 다시 시작해주세요.");
    }
  }
  async context(actor: CustomerActor) {
    return this.db.runTransaction(async (tx) => {
      await this.authorize(tx, actor);
      const settings = await tx.get(this.db.doc(SETTINGS));
      return { settings: settingsValue(settings.data()), canConfigure: actor.isAdmin };
    });
  }
  async saveSettings(input: z.infer<typeof savePlanningSettingsSchema>, actor: CustomerActor) {
    if (!actor.isAdmin) throw new HttpsError("permission-denied", "관리자만 회사 출발지를 변경할 수 있습니다.");
    return this.db.runTransaction(async (tx) => {
      await this.authorize(tx, actor);
      const ref = this.db.doc(SETTINGS); const receipt = this.db.doc(lockPath(input.requestId));
      const [current, lock] = await tx.getAll(ref, receipt); const hash = fingerprint(input);
      if (lock!.exists) { this.checkReceipt(lock!.data()!, actor, "settings", hash); return settingsValue(lock!.get("result")); }
      const old = settingsValue(current!.data()); if (old.revision !== input.expectedRevision) throw conflict();
      const result = settingsValue({ ...input.draft, revision: (old.revision ?? 0) + 1 });
      tx.set(ref, { ...result, updatedAt: this.clock(), updatedBy: actor.employeeId });
      tx.create(receipt, { operation: "settings", actorUid: actor.uid, employeeId: actor.employeeId, fingerprint: hash, result, createdAt: this.clock() });
      this.audit(tx, actor, "DELIVERY_PLANNING_SETTINGS_UPDATED", input.requestId, { revision: result.revision });
      return result;
    });
  }
  private async photos(tx: Transaction, date: string) {
    const result = await tx.get(this.db.collection(DELIVERY_PHOTO_PATH).where("deliveryDateKey", "==", date).limit(2001));
    if (result.size > 2000) throw new HttpsError("resource-exhausted", "오늘 기록이 많아 자동 목록을 준비하지 못했습니다. 수동 편집을 이용해주세요.");
    return result.docs.map((doc) => doc.data()).filter((p) => p.status === "active" && p.expiresAt instanceof Timestamp && p.expiresAt.toMillis() > this.clock().toMillis());
  }
  private async customers(tx: Transaction): Promise<Array<MatchCustomer & { revision: number; district: string }>> {
    const result = await tx.get(this.db.collection(CUSTOMER_COLLECTION_PATH).limit(5001));
    if (result.size > 5000) throw new HttpsError("resource-exhausted", "거래처 목록을 자동 확인할 수 없습니다.");
    return result.docs.filter((doc) => doc.get("status") === "active" && doc.get("companyId") === "onnuri" && doc.get("customerId") === doc.id)
      .map((doc) => ({ customerId: doc.id, name: String(doc.get("name") ?? ""), officialAddress: String(doc.get("officialAddress") ?? ""),
        deliveryAddress: String(doc.get("deliveryAddress") ?? ""), revision: Number(doc.get("revision")), district: String(doc.get("district") ?? "") }));
  }
  // All reads precede writes. Addition merges the latest state rather than replacing a stale client snapshot.
  private async addCustomer(tx: Transaction, actor: CustomerActor, customerId: string, date: string): Promise<PlanningLists> {
    this.today(date);
    const routeRef = this.db.doc(`${DELIVERY_PHOTO_ROUTE_PATH}/${actor.employeeId}`);
    const dayRef = this.db.doc(`${DELIVERY_PHOTO_DAY_PATH}/${actor.employeeId}_${date}`);
    const [routeDoc, dayDoc, customer] = await tx.getAll(routeRef, dayRef, this.db.doc(`${CUSTOMER_COLLECTION_PATH}/${customerId}`));
    if (!customer!.exists || customer!.get("status") !== "active" || customer!.get("companyId") !== "onnuri" || customer!.get("customerId") !== customerId) {
      throw new HttpsError("failed-precondition", "활성 거래처를 다시 선택해주세요.");
    }
    const photos = await this.photos(tx, date); const old = routeValue(routeDoc!.data()); const day = dayDoc!.data();
    const myIds = old?.customerIds ?? [];
    // A saved day without override still represents an explicit user choice: preserve its effective list.
    const baseline: string[] = day ? (day.hasOverride ? day.customerIds : myIds) : [];
    const photoIds = photos.filter((p) => p.createdByEmployeeId === actor.employeeId || myIds.includes(p.customerId)).map((p) => String(p.customerId));
    const routeIds = unique([...myIds, customerId]); const todayIds = unique([...baseline, ...photoIds, customerId]);
    if (routeIds.length > 100 || todayIds.length > 100) throw new HttpsError("resource-exhausted", "납품처는 최대 100곳입니다. 목록을 정리한 뒤 다시 시도해주세요.");
    const now = this.clock(); const routeChanged = !old || !myIds.includes(customerId);
    const route = deliveryPhotoRouteSchema.parse(routeChanged ? { employeeId: actor.employeeId, customerIds: routeIds, revision: (old?.revision ?? 0) + 1,
      updatedAt: now.toDate().toISOString(), updatedByEmployeeId: actor.employeeId } : old);
    const dayChanged = !day?.hasOverride || fingerprint(day.customerIds) !== fingerprint(todayIds);
    const resultDay = deliveryPhotoDayResultSchema.parse({ deliveryDateKey: date, customerIds: todayIds, revision: (day?.revision ?? 0) + (dayChanged ? 1 : 0), isOverride: true });
    if (routeChanged) tx.set(routeRef, { ...route, updatedAt: now });
    if (dayChanged) tx.set(dayRef, { employeeId: actor.employeeId, deliveryDateKey: date, hasOverride: true, customerIds: todayIds, revision: resultDay.revision,
      updatedAt: now, updatedByEmployeeId: actor.employeeId, expiresAt: Timestamp.fromMillis(now.toMillis() + 14 * 86400_000) });
    return { route, day: resultDay };
  }
  private async reserve(actor: CustomerActor, requestId: string, operation: "scan" | "route", hash: string, date: string) {
    return this.db.runTransaction(async (tx) => {
      await this.authorize(tx, actor); this.today(date);
      const ref = this.db.doc(lockPath(requestId));
      const companyRate = this.db.doc(`deliveryPlanningRates/${operation}_company`);
      const personalRate = this.db.doc(`deliveryPlanningRates/${operation}_employee_${actor.employeeId}`);
      const [lock, company, personal] = await tx.getAll(ref, companyRate, personalRate);
      if (lock!.exists) {
        this.checkReceipt(lock!.data()!, actor, operation, hash);
        if (lock!.get("state") === "complete") return lock!.get("result") as unknown;
        throw new HttpsError("failed-precondition", "이 요청은 처리 중이거나 결과를 확인하지 못했습니다. 목록을 새로 확인한 뒤 다시 시도해주세요.");
      }
      const companyCount = company!.get("date") === date ? Number(company!.get("count") ?? 0) : 0;
      const personalCount = personal!.get("date") === date ? Number(personal!.get("count") ?? 0) : 0;
      if (companyCount >= (operation === "scan" ? 250 : 45) || personalCount >= (operation === "scan" ? 60 : 15)) {
        throw new HttpsError("resource-exhausted", "오늘 자동 분석 한도에 도달했습니다. 직접 편집은 계속 이용할 수 있어요.");
      }
      const now = this.clock(); const expiresAt = Timestamp.fromMillis(now.toMillis() + 14 * 86400_000);
      tx.set(companyRate, { date, count: companyCount + 1 }); tx.set(personalRate, { date, count: personalCount + 1 });
      tx.create(ref, { operation, actorUid: actor.uid, employeeId: actor.employeeId, fingerprint: hash, state: "pending", createdAt: now, expiresAt });
      return null;
    });
  }
  async analyze(input: z.infer<typeof analyzeInvoiceSchema>, actor: CustomerActor): Promise<InvoiceResult> {
    const started = this.clock().toMillis(); this.today(input.deliveryDateKey);
    const hash = fingerprint({ date: input.deliveryDateKey, imageHash: createHash("sha256").update(input.fileBase64).digest("hex"), type: input.contentType });
    // Authenticate before decoding/decompressing untrusted image bytes.
    await this.db.runTransaction((tx) => this.authorize(tx, actor));
    const image = await invoiceImage(input.fileBase64, input.contentType);
    const cached = await this.reserve(actor, input.requestId, "scan", hash, input.deliveryDateKey);
    if (cached) return invoiceResultSchema.parse(cached);
    const fields = await this.providers.readInvoice(image);
    return this.db.runTransaction(async (tx) => {
      await this.authorize(tx, actor); this.today(input.deliveryDateKey);
      const ref = this.db.doc(lockPath(input.requestId)); const lock = await tx.get(ref);
      this.checkReceipt(lock.data()!, actor, "scan", hash);
      if (lock.get("state") === "complete") return invoiceResultSchema.parse(lock.get("result"));
      const matched = matchInvoice(fields, await this.customers(tx), input.deliveryDateKey);
      const lists = matched.customerId ? await this.addCustomer(tx, actor, matched.customerId, input.deliveryDateKey) : null;
      const result = invoiceResultSchema.parse({ scanId: input.requestId, fields, ...matched, status: lists ? "saved" : "review", lists,
        elapsedMs: Math.max(0, this.clock().toMillis() - started) });
      tx.update(ref, { state: "complete", result, deliveryDateKey: input.deliveryDateKey });
      this.audit(tx, actor, lists ? "INVOICE_CUSTOMER_REGISTERED" : "INVOICE_REVIEW_REQUIRED", input.requestId, { customerId: matched.customerId, deliveryDateKey: input.deliveryDateKey });
      return result;
    });
  }
  async confirm(input: z.infer<typeof confirmInvoiceSchema>, actor: CustomerActor): Promise<InvoiceResult> {
    return this.db.runTransaction(async (tx) => {
      await this.authorize(tx, actor); this.today(input.deliveryDateKey);
      const receipt = this.db.doc(lockPath(input.requestId)); const scanRef = this.db.doc(lockPath(input.scanId));
      const [lock, scan] = await tx.getAll(receipt, scanRef); const hash = fingerprint(input);
      if (lock!.exists) { this.checkReceipt(lock!.data()!, actor, "confirm", hash); return invoiceResultSchema.parse(lock!.get("result")); }
      if (!scan!.exists || scan!.get("actorUid") !== actor.uid || scan!.get("employeeId") !== actor.employeeId || scan!.get("operation") !== "scan"
        || scan!.get("deliveryDateKey") !== input.deliveryDateKey || scan!.get("state") !== "complete") throw new HttpsError("failed-precondition", "오늘 분석한 명세서를 다시 확인해주세요.");
      const old = invoiceResultSchema.parse(scan!.get("result"));
      if (old.status === "saved") {
        if (old.customerId !== input.customerId) throw conflict();
        return old;
      }
      if (old.fields.invoiceDate !== input.deliveryDateKey && !input.dateConfirmed) throw new HttpsError("failed-precondition", "이 명세서가 오늘 납품 건인지 확인해주세요.");
      const lists = await this.addCustomer(tx, actor, input.customerId, input.deliveryDateKey);
      const result = invoiceResultSchema.parse({ ...old, status: "saved", customerId: input.customerId, lists, reason: "직접 확인한 거래처로 저장했어요." });
      tx.update(scanRef, { result });
      tx.create(receipt, { operation: "confirm", actorUid: actor.uid, employeeId: actor.employeeId, fingerprint: hash, result, createdAt: this.clock() });
      this.audit(tx, actor, "INVOICE_CUSTOMER_CONFIRMED", input.requestId, { customerId: input.customerId, deliveryDateKey: input.deliveryDateKey });
      return result;
    });
  }
  private async routeBasis(tx: Transaction, actor: CustomerActor, date: string) {
    this.today(date);
    const [config, day, route] = await tx.getAll(this.db.doc(SETTINGS), this.db.doc(`${DELIVERY_PHOTO_DAY_PATH}/${actor.employeeId}_${date}`), this.db.doc(`${DELIVERY_PHOTO_ROUTE_PATH}/${actor.employeeId}`));
    const settings = settingsValue(config!.data());
    const ids: string[] = day!.get("hasOverride") ? day!.get("customerIds") : route!.get("customerIds") ?? [];
    if (ids.length < 2 || ids.length > 20) throw new HttpsError("failed-precondition", "오늘 납품처가 2~20곳일 때 경로를 추천할 수 있어요.");
    if (!settings.originPoint) throw new HttpsError("failed-precondition", "관리자가 회사 출발 위치를 먼저 확인해야 합니다.");
    const photos = await this.photos(tx, date);
    if (photos.some((p) => ids.includes(p.customerId))) throw new HttpsError("failed-precondition", "이미 납품사진이 있어요. 회사 출발 경로는 출발 전에 준비해주세요. 오늘 순서는 직접 편집할 수 있습니다.");
    const catalog = await this.customers(tx); const customers = ids.map((id) => catalog.find((c) => c.customerId === id));
    if (customers.some((c) => !c)) throw new HttpsError("failed-precondition", "오늘 목록의 거래처 정보를 새로 확인해주세요.");
    const destinations = customers.map((c) => ({ customerId: c!.customerId, name: c!.name, address: customerRouteAddress(c!) }));
    const missing = destinations.filter((c) => !c.address);
    if (missing.length) throw new HttpsError("failed-precondition", `등록 주소를 확인해주세요: ${missing.slice(0, 3).map((c) => c.name).join(", ")}${missing.length > 3 ? ` 외 ${missing.length - 3}곳` : ""}`);
    const basis = fingerprint({ locationSource: "displayed-address-v1", settings, dayRevision: day!.get("revision") ?? null, ids,
      customers: customers.map((c) => ({ id: c!.customerId, revision: c!.revision, address: c!.deliveryAddress.trim() || c!.officialAddress.trim(), district: c!.district })) });
    return { settings, ids, destinations, basis, dayRevision: day!.get("revision") as number | undefined ?? null };
  }
  async recommend(input: z.infer<typeof recommendRouteSchema>, actor: CustomerActor) {
    const initial = await this.db.runTransaction(async (tx) => { await this.authorize(tx, actor); return this.routeBasis(tx, actor, input.deliveryDateKey); });
    if (input.expectedDayRevision !== initial.dayRevision || !initial.ids.includes(input.lastCustomerId)) throw conflict();
    const hash = fingerprint(input);
    const cached = await this.reserve(actor, input.requestId, "route", hash, input.deliveryDateKey);
    if (cached) return routeRecommendationSchema.parse(cached);
    const stops = await resolveRegisteredStops(initial.destinations, this.providers.resolveAddress);
    // Address lookup is outside transactions. Recheck before the route API as well as after it.
    await this.db.runTransaction(async (tx) => { await this.authorize(tx, actor); if (initial.basis !== (await this.routeBasis(tx, actor, input.deliveryDateKey)).basis) throw conflict(); });
    const optimized = await this.providers.optimize(initial.settings, stops, input.lastCustomerId, this.clock().toDate());
    return this.db.runTransaction(async (tx) => {
      await this.authorize(tx, actor);
      const current = await this.routeBasis(tx, actor, input.deliveryDateKey);
      if (initial.basis !== current.basis) throw conflict();
      const result = routeRecommendationSchema.parse({ ...optimized, recommendationId: input.requestId, deliveryDateKey: input.deliveryDateKey,
        calculatedAt: this.clock().toDate().toISOString(), notice: PLANNING_NOTICE });
      if (result.customerIds.at(-1) !== input.lastCustomerId || new Set(result.customerIds).size !== initial.ids.length || result.customerIds.length !== initial.ids.length
        || initial.ids.some((id) => !result.customerIds.includes(id))) throw new HttpsError("unavailable", "추천 경로의 납품처가 일치하지 않습니다.");
      tx.update(this.db.doc(lockPath(input.requestId)), { state: "complete", result, basis: initial.basis });
      this.audit(tx, actor, "DELIVERY_ROUTE_RECOMMENDED", input.requestId, { customerCount: initial.ids.length });
      return result;
    });
  }
  async apply(input: z.infer<typeof applyRecommendationSchema>, actor: CustomerActor) {
    return this.db.runTransaction(async (tx) => {
      await this.authorize(tx, actor); this.today(input.deliveryDateKey);
      const receipt = this.db.doc(lockPath(input.requestId)); const [lock, recommendation] = await tx.getAll(receipt, this.db.doc(lockPath(input.recommendationId)));
      const hash = fingerprint(input);
      if (lock!.exists) { this.checkReceipt(lock!.data()!, actor, "apply", hash); return deliveryPhotoDayResultSchema.parse(lock!.get("result")); }
      if (!recommendation!.exists || recommendation!.get("actorUid") !== actor.uid || recommendation!.get("employeeId") !== actor.employeeId
        || recommendation!.get("operation") !== "route" || recommendation!.get("state") !== "complete") throw new HttpsError("failed-precondition", "경로 추천을 다시 요청해주세요.");
      const route = routeRecommendationSchema.parse(recommendation!.get("result"));
      const current = await this.routeBasis(tx, actor, input.deliveryDateKey);
      if (route.deliveryDateKey !== input.deliveryDateKey || recommendation!.get("basis") !== current.basis) throw conflict();
      if (this.clock().toMillis() - Date.parse(route.calculatedAt) > 30 * 60_000) throw new HttpsError("failed-precondition", "추천 후 30분이 지났어요. 교통 정보를 다시 계산해주세요.");
      const now = this.clock();
      const result = deliveryPhotoDayResultSchema.parse({ deliveryDateKey: input.deliveryDateKey, customerIds: route.customerIds, revision: (current.dayRevision ?? 0) + 1, isOverride: true });
      tx.set(this.db.doc(`${DELIVERY_PHOTO_DAY_PATH}/${actor.employeeId}_${input.deliveryDateKey}`), { employeeId: actor.employeeId, deliveryDateKey: input.deliveryDateKey,
        hasOverride: true, customerIds: result.customerIds, revision: result.revision, updatedAt: now, updatedByEmployeeId: actor.employeeId, expiresAt: Timestamp.fromMillis(now.toMillis() + 14 * 86400_000) });
      tx.create(receipt, { operation: "apply", actorUid: actor.uid, employeeId: actor.employeeId, fingerprint: hash, result, createdAt: now });
      this.audit(tx, actor, "DELIVERY_ROUTE_APPLIED", input.requestId, { customerCount: result.customerIds.length, deliveryDateKey: input.deliveryDateKey });
      return result;
    });
  }
}
