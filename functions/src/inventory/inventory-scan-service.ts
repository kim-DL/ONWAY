import { createHash } from "node:crypto";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import type { z } from "zod";
import { invoiceImage } from "../delivery-planning/planning-providers.js";
import { inventoryToday } from "./inventory-calendar.js";
import { verifyInventoryTransactionActor, type InventoryActor } from "./inventory-authorization.js";
import { labelReadingSchema, type LabelReading, type RegistrationOutcome, type scanImageInput } from "./inventory-scan-contract.js";

const company = "companies/onnuri/";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const expires = (now: Date, days: number) => Timestamp.fromMillis(now.getTime() + days * 86_400_000);
export async function analyzeInventoryImage(db: Firestore, input: z.infer<typeof scanImageInput>, actor: InventoryActor,
  analyze: (image: Buffer) => Promise<LabelReading>, now = new Date()): Promise<LabelReading> {
  const ref = db.doc(company + "inventoryScanRequests/" + input.requestId);
  const day = inventoryToday(now);
  const usage = [db.doc(company + "inventoryScanUsage/" + day), db.doc(company + "inventoryScanUsage/" + day + "-" + hash(actor.employeeId))];
  const fingerprint = hash(input.contentType + ":" + input.fileBase64);
  const image = await invoiceImage(input.fileBase64, input.contentType);
  const prior = await db.runTransaction(async tx => {
    await verifyInventoryTransactionActor(db, tx, actor, "write");
    const saved = (await tx.get(ref)).data();
    if (saved) {
      if (saved.uid !== actor.uid || saved.fingerprint !== fingerprint) throw new HttpsError("already-exists", "이 촬영 요청을 확인할 수 없습니다.");
      if (saved.state === "ready") return labelReadingSchema.parse(saved.reading);
      if (saved.state === "pending") throw new HttpsError("failed-precondition", "앞선 사진 요청이 처리 중이에요.");
      if (saved.state !== "failed" || !input.retryFailed) throw new HttpsError("failed-precondition", "이 사진의 판독을 마치지 못했어요. 사진 판독을 다시 눌러주세요.");
    }
    const counts = await Promise.all(usage.map(counter => tx.get(counter)));
    const limits = [250, 60];
    if (counts.some((s, index) => Number(s.get("count") ?? 0) >= limits[index]!)) throw new HttpsError("resource-exhausted", "오늘 사진 판독 횟수를 모두 사용했어요. 직접 입력을 이용해주세요.");
    counts.forEach((s, index) => tx.set(usage[index]!, { count: Number(s.get("count") ?? 0) + 1, expiresAt: expires(now, 2) }));
    if (saved) tx.update(ref, { state: "pending", expiresAt: expires(now, 1) });
    else tx.create(ref, { uid: actor.uid, fingerprint, state: "pending", expiresAt: expires(now, 1) });
    return null;
  });
  if (prior) return prior;
  let reading: LabelReading;
  try { reading = labelReadingSchema.parse(await analyze(image)); }
  catch (error) { await ref.update({ state: "failed" }); throw error; }
  await db.runTransaction(async tx => {
    await verifyInventoryTransactionActor(db, tx, actor, "write");
    tx.update(ref, { state: "ready", reading });
  });
  return reading;
}
export async function recordRegistrationOutcome(db: Firestore, input: RegistrationOutcome, actor: InventoryActor) {
  const { requestId, ...metrics } = input;
  const ref = db.doc(company + "inventoryRegistrationMetrics/" + hash(actor.uid + ":" + requestId));
  const now = new Date();
  await db.runTransaction(async tx => {
    await verifyInventoryTransactionActor(db, tx, actor, "write");
    if (!(await tx.get(ref)).exists) tx.create(ref, { ...metrics, createdAt: now, expiresAt: expires(now, 90) });
  });
  return { recorded: true };
}
