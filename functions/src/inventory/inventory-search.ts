import type { InventoryProduct } from "./inventory-contract.js";

const INITIALS = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
function normalize(value: string) { return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/gu, ""); }
export function inventoryInitials(value: string): string {
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0) - 0xac00;
    return code >= 0 && code <= 11171 ? INITIALS[Math.floor(code / 588)] : character;
  }).join("");
}
export function inventorySearchText(product: InventoryProduct) {
  const target = [product.name, product.manufacturer, product.specification, product.origin].join(" ");
  // Preserve compatibility jamo before NFKC normalization for Korean initial search.
  return { text: normalize(target), initials: normalize(inventoryInitials(target)) };
}
export function inventorySearchMatcher(query: string) {
  const normalizedQuery = normalize(query);
  return (target: ReturnType<typeof inventorySearchText>) => target.text.includes(normalizedQuery) || target.initials.includes(normalizedQuery);
}
export function matchesInventorySearch(product: InventoryProduct, query: string): boolean {
  return inventorySearchMatcher(query)(inventorySearchText(product));
}
