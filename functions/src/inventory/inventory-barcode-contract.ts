import { z } from "zod";

// GS1 comparison form. Preserve the check digit and packaging indicator.
export function canonicalGtin(raw: string): string | null {
  const digits = raw.trim();
  if (!/^(?:\d{8}|\d{12,14})$/.test(digits) || /^0+$/.test(digits)) return null;
  const padded = digits.padStart(14, "0");
  let sum = 0;
  for (let i = 0; i < 14; i++) sum += Number(padded[i]) * (i % 2 === 0 ? 3 : 1);
  return sum % 10 === 0 ? padded : null;
}
export const gtinSchema = z.string().max(14).refine((value) => canonicalGtin(value) !== null, "바코드 숫자를 확인해주세요.").transform((value) => canonicalGtin(value)!);
export const scanBarcodeLinkSchema = z.object({ code: gtinSchema, level: z.enum(["unit", "case"]) }).strict();
export type ScanBarcodeLink = z.infer<typeof scanBarcodeLinkSchema>;
export const scanBarcodesSchema = z.array(scanBarcodeLinkSchema).min(1).max(3)
  .refine((links) => new Set(links.map((link) => link.code)).size === links.length, "같은 바코드를 중복해서 연결할 수 없습니다.");
