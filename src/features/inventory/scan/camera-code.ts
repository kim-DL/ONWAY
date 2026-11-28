import { canonicalGtin } from "@/domain/inventory-scan";

export interface DetectedCode { rawValue: string; format: string }

/** UPC-E encodes a UPC-A number. Its printed eight digits must not be interpreted as EAN-8. */
export function retailCode({ rawValue, format }: DetectedCode): string | undefined {
  let digits = rawValue;
  switch (format) {
    case "upc_e": {
      if (!/^[01]\d{7}$/.test(digits)) return;
      const last = digits.charAt(6);
      if ("012".includes(last)) digits = digits.slice(0, 3) + last + "0000" + digits.slice(3, 6) + digits.charAt(7);
      else if (last === "3") digits = digits.slice(0, 4) + "00000" + digits.slice(4, 6) + digits.charAt(7);
      else if (last === "4") digits = digits.slice(0, 5) + "00000" + digits.charAt(5) + digits.charAt(7);
      else digits = digits.slice(0, 6) + "0000" + last + digits.charAt(7);
      break;
    }
    case "ean_8": if (!/^\d{8}$/.test(digits)) return; break;
    case "upc_a": if (!/^\d{12}$/.test(digits)) return; break;
    case "ean_13": if (!/^\d{13}$/.test(digits)) return; break;
    case "itf": if (!/^\d{14}$/.test(digits)) return; break;
    default: return;
  }
  return canonicalGtin(digits) ? digits : undefined;
}

export function uniqueRetailCodes(detections: DetectedCode[]): string[] {
  const byGtin = new Map<string, string>();
  for (const result of detections) {
    const digits = retailCode(result);
    if (digits) byGtin.set(canonicalGtin(digits)!, digits);
  }
  return [...byGtin.values()];
}
