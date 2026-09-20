// Pure shared phone helpers: safe for both the browser and Functions bundles.
const PHONE_SEPARATORS = /[() .\-\s]/gu;
const PHONE_CHARACTERS = /^[0-9+() .\-\s]+$/u;
const REGIONAL_PREFIX = /^0(?:3[1-3]|4[1-4]|5[1-5]|6[1-4])/;

/** Syntax validation, not a claim that a number is assigned or reachable. */
export function isValidPhoneNumber(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length <= 30 && PHONE_CHARACTERS.test(trimmed)
    && /^\+?\d{3,20}$/.test(trimmed.replace(PHONE_SEPARATORS, ""));
}

/** Format only complete, recognized Korean numbers; never guess or drop digits. */
export function formatPhoneNumber(value: string): string {
  const trimmed = value.trim();
  if (!isValidPhoneNumber(trimmed) || trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(PHONE_SEPARATORS, "");
  let prefixLength: number | undefined;
  if (digits.startsWith("02") && (digits.length === 9 || digits.length === 10)) prefixLength = 2;
  else if (REGIONAL_PREFIX.test(digits) && (digits.length === 10 || digits.length === 11)) prefixLength = 3;
  else if (/^(?:010|070)\d{8}$/.test(digits)) prefixLength = 3;
  else if (/^01[16789]\d{7,8}$/.test(digits) || /^080\d{7}$/.test(digits)) prefixLength = 3;
  else if (/^050[2-8]\d{7,8}$/.test(digits)) prefixLength = 4;
  else if (/^1[568]\d{6}$/.test(digits)) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  if (prefixLength === undefined) return trimmed;
  return `${digits.slice(0, prefixLength)}-${digits.slice(prefixLength, -4)}-${digits.slice(-4)}`;
}

export function formatNullablePhoneNumber(value: string | null): string | null {
  return value === null ? null : formatPhoneNumber(value) || null;
}
