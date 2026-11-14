import { Timestamp, type Firestore, type Transaction } from "firebase-admin/firestore";

export async function hasActivePinReservation(
  db: Firestore,
  transaction: Transaction,
  lookupKey: string,
  now: Timestamp,
  ownReservationId?: string,
) {
  const canonical = await transaction.get(db.doc(`pinReservations/${lookupKey}`));
  const legacy = await transaction.get(db.collection("pinReservations").where("lookupKey", "==", lookupKey));
  return [canonical, ...legacy.docs].some((snapshot) => {
    if (!snapshot.exists || snapshot.id === ownReservationId) return false;
    const expiresAt: unknown = snapshot.get("expiresAt");
    return expiresAt instanceof Timestamp && expiresAt.toMillis() > now.toMillis();
  });
}
