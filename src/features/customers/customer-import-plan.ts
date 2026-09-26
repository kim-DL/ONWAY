import { z } from "zod";

import { customerDraftSchema, normalizeCustomerName, type Customer, type CustomerDraft } from "@/domain/customer";

const entrySchema = z.object({
  sourceId: z.string().regex(/^C-\d{3}$/),
  requestId: z.uuid(),
  draft: customerDraftSchema,
}).strict().refine((entry) => Boolean(entry.draft.deliveryAddress.trim() || entry.draft.officialAddress.trim()),
  "납품 주소가 비어 있습니다.");

export const customerImportManifestSchema = z.object({
  schemaVersion: z.literal(1),
  entries: z.array(entrySchema).min(1).max(250),
}).strict().refine((manifest) => new Set(manifest.entries.map((entry) => entry.sourceId)).size === manifest.entries.length,
  "통합 ID가 중복되었습니다.")
  .refine((manifest) => new Set(manifest.entries.map((entry) => entry.requestId)).size === manifest.entries.length,
    "요청 ID가 중복되었습니다.");

export type CustomerImportEntry = { sourceId: string; requestId: string; draft: CustomerDraft };
export type CustomerImportPlan = { create: CustomerImportEntry[]; existing: CustomerImportEntry[]; review: CustomerImportEntry[] };

function key(value: string) {
  return normalizeCustomerName(value);
}

function address(draft: Pick<CustomerDraft, "deliveryAddress" | "officialAddress">) {
  return key(draft.deliveryAddress.trim() || draft.officialAddress.trim());
}

export function planCustomerImport(entries: CustomerImportEntry[], customers: Customer[]): CustomerImportPlan {
  const plan: CustomerImportPlan = { create: [], existing: [], review: [] };
  for (const entry of entries) {
    const nameKey = key(entry.draft.name);
    const addressKey = address(entry.draft);
    // Separate vendors can share a building. An identical name in this same
    // manifest still needs review before we create another customer record.
    const incomingCollision = entries.some((other) => other !== entry && key(other.draft.name) === nameKey);
    const match = customers.filter((customer) => key(customer.name) === nameKey || address(customer) === addressKey);
    if (incomingCollision || match.some((customer) => key(customer.name) !== nameKey || address(customer) !== addressKey)) {
      plan.review.push(entry);
    } else if (match.length) {
      plan.existing.push(entry);
    } else {
      plan.create.push(entry);
    }
  }
  return plan;
}
