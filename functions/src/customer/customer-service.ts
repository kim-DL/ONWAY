import { createHash, randomUUID } from "node:crypto";
import { FieldPath, Timestamp, type DocumentData, type Firestore } from "firebase-admin/firestore";

import { getAdminFirestore } from "../shared/firebase-admin.js";
import { formatPhoneNumber } from "../shared/phone-number.js";
import { verifyCustomerTransactionActor, type CustomerActor } from "./customer-authorization.js";
import { resolveCustomerPhotoChange } from "./customer-photo-store.js";
import {
  CUSTOMER_COLLECTION_PATH, CUSTOMER_COMPANY_ID, customerDraftSchema, customerSchema,
  getCustomerChoseong, normalizeCustomerName,
  type Customer, type CustomerDraft, type SaveCustomerInput,
} from "./customer-contract.js";

export class CustomerRevisionConflict extends Error {}
export class CustomerRequestCollision extends Error {}
export class CustomerNotFound extends Error {}

export function customerFromDocument(data: DocumentData): Customer {
  return customerSchema.parse({
    ...data,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : null,
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : null,
  });
}

export function customerResponse(customer: Customer, includeOverviewPhoto = false): Customer {
  if (includeOverviewPhoto || !("overviewPhoto" in customer)) return customer;
  // Older installed clients validate a strict wire schema. Opt-in keeps their
  // normal list/save flows working without exposing a new unknown field.
  const { overviewPhoto: _photo, ...legacy } = customer;
  void _photo;
  return legacy;
}

function primaryContact(draft: Pick<CustomerDraft, "contacts">) {
  const contact = draft.contacts.find((item) => item.isPrimary);
  return contact ? { name: contact.name, role: contact.role, phoneNumber: contact.phoneNumber.replace(/[() .-]/g, "") } : null;
}

export function customerCoreInformationChanged(current: Customer, draft: CustomerDraft): boolean {
  return current.accessPassword !== draft.accessPassword
    || current.accessPasswordState !== draft.accessPasswordState
    || current.deliveryAddress !== draft.deliveryAddress
    || current.deliveryLocationDescription !== draft.deliveryLocationDescription
    || JSON.stringify(current.deliveryPoint) !== JSON.stringify(draft.deliveryPoint)
    || JSON.stringify(primaryContact(current)) !== JSON.stringify(primaryContact(draft));
}

export function customerChangedFields(current: Customer | null, next: Customer): string[] {
  // Audit field names only. Delivery passwords, contact details, addresses and
  // freeform notes belong in the protected customer document, never in logs.
  const changed: string[] = (Object.keys(customerDraftSchema.shape) as Array<keyof CustomerDraft>)
    .filter((field) => !current || JSON.stringify(current[field]) !== JSON.stringify(next[field]));
  if (JSON.stringify(current?.overviewPhoto ?? null) !== JSON.stringify(next.overviewPhoto ?? null)) changed.push("overviewPhoto");
  return changed;
}

export function nextCustomer(current: Customer | null, input: SaveCustomerInput, customerId: string, employeeId: string, now: string): Customer {
  const coreChanged = current !== null && customerCoreInformationChanged(current, input.draft);
  return customerSchema.parse({
    ...input.draft,
    contacts: input.draft.contacts.map((contact) => ({ ...contact, phoneNumber: formatPhoneNumber(contact.phoneNumber) })),
    ...(current?.overviewPhoto !== undefined ? { overviewPhoto: current.overviewPhoto } : {}),
    accessPassword: input.draft.accessPasswordState === "registered" ? input.draft.accessPassword : "",
    customerId, companyId: CUSTOMER_COMPANY_ID,
    normalizedName: normalizeCustomerName(input.draft.name), choseongName: getCustomerChoseong(input.draft.name),
    noticeType: input.clearNotice ? "none" : current === null ? input.draft.noticeType : coreChanged ? "changed" : input.draft.noticeType,
    revision: (current?.revision ?? 0) + 1,
    createdAt: current?.createdAt ?? now, createdBy: current?.createdBy ?? employeeId,
    updatedAt: now, updatedBy: employeeId,
  });
}

export class CustomerService {
  constructor(private readonly db: Firestore = getAdminFirestore()) {}

  async list(afterId: string | null, includeOverviewPhoto = false) {
    let query = this.db.collection(CUSTOMER_COLLECTION_PATH).orderBy(FieldPath.documentId()).limit(251);
    if (afterId) query = query.startAfter(afterId);
    const snapshot = await query.get();
    const docs = snapshot.docs.slice(0, 250);
    return {
      customers: docs.map((document) => customerResponse(customerFromDocument(document.data()), includeOverviewPhoto)),
      nextCursor: snapshot.docs.length > 250 ? docs.at(-1)!.id : null,
    };
  }

  async save(input: SaveCustomerInput, actor: CustomerActor): Promise<Customer> {
    const { includeOverviewPhoto: _capability, ...mutation } = input;
    void _capability;
    const fingerprint = createHash("sha256").update(JSON.stringify(mutation)).digest("hex");
    const customerId = input.customerId ?? this.db.collection(CUSTOMER_COLLECTION_PATH).doc().id;
    const ref = this.db.doc(`${CUSTOMER_COLLECTION_PATH}/${customerId}`);
    const lockRef = this.db.doc(`requestLocks/customer-${input.requestId}`);
    return this.db.runTransaction(async (transaction) => {
      await verifyCustomerTransactionActor(this.db, transaction, actor);
      const lock = await transaction.get(lockRef);
      if (lock.exists) {
        const stored = lock.data();
        if (stored?.operation !== "saveCustomer" || stored.actorUid !== actor.uid || stored.requestFingerprint !== fingerprint) throw new CustomerRequestCollision();
        const saved = await transaction.get(this.db.doc(`${CUSTOMER_COLLECTION_PATH}/${stored.customerId}`));
        if (!saved.exists) throw new CustomerNotFound();
        return customerFromDocument(saved.data()!);
      }
      const snapshot = await transaction.get(ref);
      if (input.customerId && !snapshot.exists) throw new CustomerNotFound();
      if (!input.customerId && snapshot.exists) throw new CustomerRequestCollision();
      const current = snapshot.exists ? customerFromDocument(snapshot.data()!) : null;
      if ((current?.revision ?? null) !== input.expectedRevision) throw new CustomerRevisionConflict();
      const now = Timestamp.now();
      const photo = await resolveCustomerPhotoChange(this.db, transaction, input, current, actor, now);
      const customer = nextCustomer(current, input, customerId, actor.employeeId, now.toDate().toISOString());
      if (photo.overviewPhoto !== undefined) customer.overviewPhoto = photo.overviewPhoto;
      transaction.set(ref, { ...customer, createdAt: current ? Timestamp.fromDate(new Date(current.createdAt)) : now, updatedAt: now });
      photo.commit(customerId);
      transaction.create(lockRef, {
        operation: "saveCustomer", actorUid: actor.uid, customerId,
        requestFingerprint: fingerprint, revision: customer.revision, createdAt: now,
      });
      const logId = randomUUID();
      transaction.create(this.db.doc(`auditLogs/${logId}`), {
        logId, eventType: current ? "CUSTOMER_UPDATED" : "CUSTOMER_CREATED",
        actorUid: actor.uid, actorEmployeeId: actor.employeeId,
        targetType: "customer", targetId: customerId, companyId: CUSTOMER_COMPANY_ID,
        revision: customer.revision, status: customer.status, noticeType: customer.noticeType,
        changedFields: customerChangedFields(current, customer),
        requestId: input.requestId, createdAt: now,
      });
      return customer;
    });
  }
}
