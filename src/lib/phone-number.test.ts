import { describe, expect, it } from "vitest";

import { customerDraftSchema } from "@/domain/customer";
import { schoolFieldProfilePatchSchema } from "@/domain/school";
import { formatPhoneNumber, isValidPhoneNumber } from "./phone-number";

describe("client contact syntax and formatting", () => {
  it("uses the same number formatter for customer and school inputs", () => {
    expect(formatPhoneNumber("01012345678")).toBe("010-1234-5678");
    expect(formatPhoneNumber("0421234567")).toBe("042-123-4567");
    expect(isValidPhoneNumber("+82 10-1234-5678")).toBe(true);
  });

  it.each(["01012345678", "02-1234-5678", "07012345678", "+82 10-1234-5678", "1588-1234"])("permits established phone input syntax: %s", (phoneNumber) => {
    expect(schoolFieldProfilePatchSchema.safeParse({ contacts: { dietitianPhone: phoneNumber, cafeteriaPhone: null } }).success).toBe(true);
    expect(customerDraftSchema.shape.contacts.safeParse([{ id: "one", name: "소은 부장", role: "", phoneNumber, isPrimary: true }]).success).toBe(true);
  });

  it.each(["---", "++821012345678", "010+12345678", "010abc12345678", "12"])("rejects malformed edits before either request: %s", (phoneNumber) => {
    expect(schoolFieldProfilePatchSchema.safeParse({ contacts: { dietitianPhone: phoneNumber, cafeteriaPhone: null } }).success).toBe(false);
    expect(customerDraftSchema.shape.contacts.safeParse([{ id: "one", name: "소은 부장", role: "", phoneNumber, isPrimary: true }]).success).toBe(false);
  });
});
