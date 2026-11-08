import { createHash } from "node:crypto";
import { normalizeCustomerName } from "../customer/customer-contract.js";
import { invoiceAddressMatches, matchInvoice, type MatchCustomer } from "./invoice-matching.js";
import type { PhotoAlias, PhotoBatchRow, PhotoExtraction, PhotoExtractionRow } from "./photo-batch-contract.js";
import { normalizedInvoiceName, registeredInvoiceNames } from "./invoice-names.js";
import { invoiceAddressRelation, type InvoiceAddressEvidence } from "./invoice-address.js";

export function photoAliasKey(text: string) {
  return createHash("sha256").update(normalizeCustomerName(text)).digest("hex");
}
export function validAliasText(text: string) {
  return /[\p{L}\p{N}]/u.test(normalizeCustomerName(text));
}
export function registeredPhotoNames(text: string) {
  return [...new Set(registeredInvoiceNames(text).map(normalizedInvoiceName).filter(Boolean))];
}
export function photoDateStatus(row: PhotoExtractionRow, today: string): PhotoBatchRow["dateStatus"] {
  if (row.dateUncertain) return "uncertain";
  if (!row.date) return "absent";
  const full = row.date.length === 5 ? `${today.slice(0, 4)}-${row.date}` : row.date;
  const parsed = new Date(`${full}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== full) return "uncertain";
  return full === today ? "current" : "different";
}
export function rowNeedsDateConfirmation(kind: PhotoExtraction["kind"], row: Pick<PhotoBatchRow, "dateStatus">) {
  return row.dateStatus === "different" || row.dateStatus === "uncertain" || (kind === "invoice" && row.dateStatus === "absent");
}
function nearbyName(left: string, right: string) {
  const limit = Math.min(left.length, right.length) >= 4 ? 2 : 1;
  if (Math.min(left.length, right.length) < 3 || Math.abs(left.length - right.length) > limit) return false;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    const next = Array<number>(right.length + 1).fill(limit + 1); next[0] = i;
    for (let j = Math.max(1, i - limit); j <= Math.min(right.length, i + limit); j++) {
      next[j] = Math.min(previous[j]! + 1, next[j - 1]! + 1, previous[j - 1]! + (left[i - 1] === right[j - 1] ? 0 : 1));
    }
    previous = next;
  }
  return previous[right.length]! <= limit;
}
export function matchPhotoRows(extraction: PhotoExtraction, customers: readonly MatchCustomer[], aliases: readonly PhotoAlias[], today: string, evidence?: InvoiceAddressEvidence): PhotoBatchRow[] {
  if (extraction.kind === "unsupported") return [];
  return extraction.rows.map((row, index) => {
    const dateStatus = photoDateStatus(row, today);
    const name = normalizedInvoiceName(row.rawName);
    const storedAlias = aliases.find((a) => a.aliasKey === photoAliasKey(row.rawName));
    const alias = storedAlias?.enabled ? storedAlias : undefined;
    const exact = customers.filter((c) => name && (extraction.kind === "customer_list"
      ? registeredPhotoNames(c.name).includes(name) : normalizeCustomerName(c.name) === name));
    const aliasTarget = alias ? customers.find((c) => c.customerId === alias.customerId) : undefined;
    const safeAlias = aliasTarget && normalizeCustomerName(aliasTarget.name) === normalizeCustomerName(alias!.targetName);
    const aliasConflict = alias && (!safeAlias || customers.some((c) => c.customerId !== alias.customerId && registeredPhotoNames(c.name).includes(name)));
    let customerId: string | null = null;
    let matchSource: PhotoBatchRow["matchSource"] = null;
    let candidateIds: string[] = [];
    let reason = "기존 거래처를 선택해주세요.";
    if (extraction.kind === "invoice") {
      const match = matchInvoice({ recipientName: row.rawName, recipientAddress: row.address,
        invoiceDate: dateStatus === "current" ? today : null, uncertain: row.uncertain }, customers, today, evidence);
      customerId = match.customerId; candidateIds = match.candidateIds; reason = match.reason;
      if (customerId) matchSource = "invoice_address";
      if (!customerId && safeAlias && !aliasConflict && !row.uncertain && dateStatus === "current"
        && [aliasTarget.officialAddress, aliasTarget.deliveryAddress].some((a) => invoiceAddressRelation(row.address, a, evidence) === "match")) {
        customerId = aliasTarget.customerId; matchSource = "alias"; reason = "기억한 이름과 주소가 일치해요.";
      }
    } else {
      candidateIds = exact.map((c) => c.customerId);
      const selected = exact.length === 1 ? exact[0] : exact.length === 0 && safeAlias ? aliasTarget : undefined;
      const addressMatches = selected && (!row.address.trim() || [selected.officialAddress, selected.deliveryAddress].some((a) => invoiceAddressMatches(row.address, a)));
      if (selected && addressMatches && !row.uncertain && !aliasConflict && !rowNeedsDateConfirmation(extraction.kind, { dateStatus })) {
        customerId = selected.customerId;
        matchSource = exact.length ? normalizeCustomerName(selected.name) === name ? "exact" : "registered_name" : "alias";
        reason = matchSource === "alias" ? "기억한 이름으로 연결했어요." : "등록된 상호와 일치해요.";
      } else if (aliasConflict) reason = "기억한 이름의 연결을 다시 확인해주세요.";
      else if (row.uncertain) reason = "읽힌 상호를 확인해주세요.";
      else if (selected && !addressMatches) reason = "사진의 주소와 등록 주소를 확인해주세요.";
      else if (exact.length > 1) reason = "같은 상호가 여러 곳이에요. 주소를 확인해주세요.";
    }
    if (aliasConflict) { customerId = null; matchSource = null; reason = "기억한 이름의 연결을 다시 확인해주세요."; }
    if (!customerId) {
      if (rowNeedsDateConfirmation(extraction.kind, { dateStatus })) reason = "오늘 납품 건인지 확인해주세요.";
      const suggestions = customers.filter((c) => name && (normalizeCustomerName(c.name).includes(name) || name.includes(normalizeCustomerName(c.name))));
      const similar = customers.filter((c) => nearbyName(name, normalizeCustomerName(c.name)));
      candidateIds = [...new Set([...candidateIds, ...(aliasTarget ? [aliasTarget.customerId] : []), ...suggestions.map((c) => c.customerId), ...similar.map((c) => c.customerId)])].slice(0, 10);
    }
    return { ...row, rowId: `row-${index + 1}`, dateStatus, status: customerId ? "saved" : "review", customerId,
      candidateIds, reason, matchSource, aliasRevision: storedAlias?.revision ?? null };
  });
}
