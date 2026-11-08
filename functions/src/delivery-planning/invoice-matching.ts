import type { InvoiceFields } from "./planning-contract.js";
import { invoiceNameCandidates, normalizedInvoiceName, registeredInvoiceNames, splitInvoiceName } from "./invoice-names.js";
import { invoiceAddressRelation, type InvoiceAddressEvidence } from "./invoice-address.js";
export { invoiceAddressMatches } from "./invoice-address.js";
export { splitInvoiceName } from "./invoice-names.js";

export interface MatchCustomer { customerId: string; name: string; officialAddress: string; deliveryAddress: string }
export function matchInvoice(fields: InvoiceFields, customers: readonly MatchCustomer[], today: string, evidence?: InvoiceAddressEvidence) {
  const { regionHint } = splitInvoiceName(fields.recipientName);
  const candidates = invoiceNameCandidates(fields.recipientName, customers);
  const relations = candidates.map((c) => {
    const exactUniqueName = candidates.length === 1 && registeredInvoiceNames(c.name)
      .some((n) => normalizedInvoiceName(n) === normalizedInvoiceName(fields.recipientName));
    const addresses = [c.officialAddress, c.deliveryAddress].filter((a) => a.trim());
    const checks = addresses.map((a) => invoiceAddressRelation(fields.recipientAddress, a, evidence, exactUniqueName));
    return { customer: c, relation: checks.includes("match") ? "match" : checks.length && checks.every((r) => r === "conflict") ? "conflict" : "unknown" };
  });
  const addressed = relations.filter((r) => r.relation === "match");
  const unique = addressed.length === 1 && !relations.some((r) => r.relation === "unknown") ? addressed[0]!.customer : null;
  const sameDate = fields.invoiceDate === today;
  const automatic = unique && sameDate && !fields.uncertain;
  return { regionHint, customerId: automatic ? unique.customerId : null, candidateIds: candidates.slice(0, 10).map((c) => c.customerId),
    reason: automatic ? "상호와 주소가 일치해 저장했어요." : !sameDate ? "명세서 날짜를 확인해주세요." : fields.uncertain ? "흐리거나 불확실한 글자가 있어요. 거래처를 확인해주세요."
      : !candidates.length ? "일치하는 거래처를 찾지 못했어요. 기존 거래처를 선택해주세요." : "상호와 주소를 함께 확인해주세요." };
}
