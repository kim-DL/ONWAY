import { describe, expect, it } from "vitest";

import type { CustomerContact } from "@/domain/customer";

import { customerDetailContacts } from "./customer-detail-contacts";

const contact = (id: string, phoneNumber = "010-1234-5678", isPrimary = false): CustomerContact => ({
  id, name: `담당자 ${id}`, role: "", phoneNumber, isPrimary,
});

describe("customer detail contacts", () => {
  it("puts the representative first, limits the initial list to two, and preserves source order", () => {
    const source = [contact("first"), contact("second"), contact("primary", "042-123-4567", true), contact("last")];
    const presentation = customerDetailContacts(source);
    expect(presentation.visible.map((item) => item.id)).toEqual(["primary", "first"]);
    expect(presentation.additional.map((item) => item.id)).toEqual(["second", "last"]);
    expect(presentation.phoneContact?.id).toBe("primary");
    expect(source.map((item) => item.id)).toEqual(["first", "second", "primary", "last"]);
  });

  it("uses an available number when the representative has no phone", () => {
    const fallback = contact("delivery-desk", "042-111-2222");
    const presentation = customerDetailContacts([contact("primary", "", true), fallback]);
    expect(presentation.phoneContact).toBe(fallback);
    expect(presentation.additional).toEqual([]);
  });

  it("does not build a phone action from invalid or empty numbers", () => {
    expect(customerDetailContacts([contact("primary", "", true), contact("bad", "abc")]).phoneContact).toBeNull();
    expect(customerDetailContacts([])).toEqual({ visible: [], additional: [], phoneContact: null });
  });

  it("keeps all ten contacts available and can call a contact inside the disclosure", () => {
    const source = Array.from({ length: 10 }, (_, index) => contact(String(index), index === 9 ? "042-123-4567" : "", index === 4));
    const presentation = customerDetailContacts(source);
    expect(presentation.visible).toHaveLength(2);
    expect(presentation.additional).toHaveLength(8);
    expect(new Set([...presentation.visible, ...presentation.additional].map((item) => item.id))).toHaveProperty("size", 10);
    expect(presentation.phoneContact?.id).toBe("9");
  });
});
