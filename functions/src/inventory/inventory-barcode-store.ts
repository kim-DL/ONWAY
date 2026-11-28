import type { DocumentReference, Firestore, Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import type { InventoryActor } from "./inventory-authorization.js";
import type { ScanBarcodeLink } from "./inventory-barcode-contract.js";

export const barcodePath = (code: string) => "companies/onnuri/inventoryBarcodes/" + code;
export async function prepareBarcodeLinks(db: Firestore, tx: Transaction, links: ScanBarcodeLink[] | undefined,
  productId: string, actor: InventoryActor, now: Date) {
  const additions: { ref: DocumentReference; level: ScanBarcodeLink["level"] }[] = [];
  for (const link of links ?? []) {
    const ref = db.doc(barcodePath(link.code));
    const prior = (await tx.get(ref)).data();
    if (prior && (prior.productId !== productId || prior.level !== link.level)) {
      throw new HttpsError("already-exists", "바코드가 이미 다른 품목이나 포장 단위에 연결되어 있습니다.", { reason: "inventory-barcode-conflict" });
    }
    if (!prior) additions.push({ ref, level: link.level });
  }
  return () => {
    for (const { ref, level } of additions) tx.create(ref, { productId, level, createdAt: now, createdBy: actor.employeeId });
  };
}
