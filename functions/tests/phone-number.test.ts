import { describe, expect, it } from "vitest";

import { formatNullablePhoneNumber, formatPhoneNumber, isValidPhoneNumber } from "../src/shared/phone-number.js";

describe("shared telephone formatting", () => {
  it.each([
    ["01012345678", "010-1234-5678"], ["0421234567", "042-123-4567"],
    ["04212345678", "042-1234-5678"], ["021234567", "02-123-4567"],
    ["0212345678", "02-1234-5678"], ["07012345678", "070-1234-5678"],
    ["0311234567", "031-123-4567"], ["0641234567", "064-123-4567"],
    ["0111234567", "011-123-4567"], ["0801234567", "080-123-4567"],
    ["050712345678", "0507-1234-5678"], ["05051234567", "0505-123-4567"],
    ["15881234", "1588-1234"], ["16441234", "1644-1234"], ["18001234", "1800-1234"],
    ["  (042) 123.4567  ", "042-123-4567"], ["010 1234 5678", "010-1234-5678"],
  ])("formats complete number %s without losing a digit", (input, expected) => {
    expect(formatPhoneNumber(input)).toBe(expected);
    expect(formatPhoneNumber(expected)).toBe(expected);
    expect(expected.replace(/\D/g, "")).toBe(input.replace(/\D/g, ""));
    expect(isValidPhoneNumber(expected)).toBe(true);
  });

  it.each([
    "010-1234-5678", "02-1234-5678", "+82 10-1234-5678", "+1 (202) 555-0123",
    "123", "1234567", "0501234567890", "010123", "010123456789", "---", "010abc12345678",
  ])("preserves already formatted, foreign, partial or unrecognized input: %s", (value) => {
    expect(formatPhoneNumber(value)).toBe(value);
  });

  it.each(["", "---", "(+)", "12", "++821012345678", "010+12345678", "javascript:1234567", "010/1234/5678", "1".repeat(21)])("rejects invalid syntax %s", (value) => {
    expect(isValidPhoneNumber(value)).toBe(false);
  });

  it("keeps optional values empty without inventing a number", () => {
    expect(formatPhoneNumber("")).toBe("");
    expect(formatNullablePhoneNumber(null)).toBeNull();
    expect(formatNullablePhoneNumber("  ")).toBeNull();
  });
});
