import { normalizeCustomerName } from "../customer/customer-contract.js";

function companyText(text: string) {
  return text.normalize("NFKC").replace(/\(\s*(?:비|비번|비밀번호|코드)\s*:[^()]*\)/gu, "")
    .replace(/^(?:\s*(?:\(\s*[주유]\s*\)|주식회사|유한회사))+/u, "")
    .replace(/(?:\(\s*[주유]\s*\)|주식회사|유한회사)\s*$/u, "").trim();
}
export function normalizedInvoiceName(text: string) {
  return normalizeCustomerName(companyText(text));
}
export function splitInvoiceName(text: string) {
  const name = companyText(text);
  const suffix = name.match(/^(.*?)\s*[(（]([^()（）]+)[)）]\s*$/u);
  return { base: suffix?.[1]?.trim() || name, regionHint: suffix?.[2]?.trim() || "" };
}
/** Separators inside a branch annotation never create independent company names. */
export function registeredInvoiceNames(text: string) {
  const parts: string[] = []; let start = 0, depth = 0;
  for (let i = 0; i < text.length; i++) {
    if ("(（".includes(text[i]!)) depth++;
    else if (")）".includes(text[i]!)) depth = Math.max(0, depth - 1);
    else if (!depth && /[,，;；]/u.test(text[i]!)) { parts.push(text.slice(start, i)); start = i + 1; }
  }
  parts.push(text.slice(start));
  return parts.map(companyText).filter(Boolean);
}
export function invoiceNameCandidates<T extends { name: string }>(name: string, customers: readonly T[]): T[] {
  const full = normalizedInvoiceName(name), source = splitInvoiceName(name);
  if (!full) return [];
  const exact = customers.filter((c) => normalizedInvoiceName(c.name) === full
    || registeredInvoiceNames(c.name).some((n) => normalizedInvoiceName(n) === full));
  if (exact.length && source.regionHint) return exact;
  const base = normalizedInvoiceName(source.base);
  return customers.filter((c) => exact.includes(c) || registeredInvoiceNames(c.name).some((n) => {
    const target = splitInvoiceName(n);
    return normalizedInvoiceName(target.base) === base && (!source.regionHint || !target.regionHint
      || normalizeCustomerName(source.regionHint) === normalizeCustomerName(target.regionHint));
  }));
}
