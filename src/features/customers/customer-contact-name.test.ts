import { describe, expect, it } from "vitest";
import { customerContactDisplayName, updateCustomerContactName } from "./customer-contact-name";

describe("unified customer contact names", () => {
  it.each([
    ["소은", "부장", "소은 부장"], ["소은 부장", "부장", "소은 부장"],
    ["김부장철", "부장", "김부장철 부장"], ["", "현장 담당자", "현장 담당자"],
    ["소은 사장", "", "소은 사장"], ["", "", ""],
    ["  소은   부장 ", " 부장 ", "소은 부장"], ["Alex CEO", "ceo", "Alex CEO"],
  ])("combines %s / %s without hiding role information", (name, role, result) => {
    expect(customerContactDisplayName({ name, role })).toBe(result);
  });
  it("does not truncate a maximum-size legacy name and role", () => {
    expect(customerContactDisplayName({ name: "가".repeat(120), role: "나".repeat(120) })).toHaveLength(241);
  });
  it("keeps unrelated contact metadata when staff edit the one name field", () => {
    const contact = { id: "contact", name: "소은", role: "부장", phoneNumber: "010-0000-0000", isPrimary: true };
    expect(updateCustomerContactName(contact, "소은 사장")).toEqual({ ...contact, name: "소은 사장", role: "" });
    expect(contact.role).toBe("부장");
  });
});
