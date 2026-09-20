import { isValidElement, type MouseEvent, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { customerSchema, type Customer } from "@/domain/customer";
import { CustomerCard, CustomerCardDirectionsLink, RecentCustomerCard, CustomerPhoneLink, confirmClosedCustomer, customerPasswordLabel, customerPhoneHref } from "./customer-card";
import { customerDirectionsHref } from "./customer-directions";

const customer: Customer = customerSchema.parse({
  customerId: "UI-CUSTOMER", companyId: "onnuri", name: "강은유통", normalizedName: "강은유통", choseongName: "ㄱㅇㅇㅌ",
  district: "서구", administrativeDong: "탄방동", officialAddress: "공식 주소", deliveryAddress: "실제 납품 주소",
  accessPassword: "00123*", accessPasswordState: "registered", deliveryLocationDescription: "건물 뒤편 좌측 창고",
  deliveryPoint: { latitude: 36.35, longitude: 127.38 },
  contacts: [{ id: "CONTACT", name: "김담당", role: "현장 담당자", phoneNumber: "010-1234-5678", isPrimary: true }],
  status: "active", noticeType: "changed", changeNote: "창고 위치 변경", revision: 1,
  createdAt: "2026-09-06T00:00:00.000Z", updatedAt: "2026-09-06T00:00:00.000Z", createdBy: "ADMIN", updatedBy: "ADMIN",
});

type Element = ReactElement<Record<string, unknown>>;
function all(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...all(node.props.children as ReactNode)];
}
afterEach(() => vi.unstubAllGlobals());

describe("customer cards and contact actions", () => {
  it("shows all essential delivery information immediately in a search-result card", () => {
    const html = renderToStaticMarkup(CustomerCard({ customer, onSelect: vi.fn() }));
    for (const text of ["강은유통", "실제 납품 주소", "00123*", "건물 뒤편 좌측 창고", "현장 담당자", "김담당", "010-1234-5678", "정보변경"]) expect(html).toContain(text);
    expect(html).toContain('href="tel:01012345678"');
    expect(html).toContain('aria-label="강은유통 김담당 현장 담당자 전화"');
    expect(html).not.toContain("공식 주소");
    expect(html).not.toContain("탄방동");
  });

  it("shows an official address when delivery address and region fields are empty", () => {
    const html = renderToStaticMarkup(CustomerCard({ customer: { ...customer, district: "", administrativeDong: "", deliveryAddress: "" }, onSelect: vi.fn() }));
    expect(html).toContain("공식 주소");
    expect(html).not.toContain("자치구 미등록");
    expect(html).not.toContain("행정동 미등록");
  });

  it.each([false, true])("keeps the selection button separate from the phone link (compact=%s)", (compact) => {
    const onSelect = vi.fn();
    const tree = CustomerCard({ customer, onSelect, compact });
    const button = all(tree).find((element) => element.type === "button")!;
    expect(button.props["aria-label"]).toBe("강은유통 상세 정보");
    expect(button.props.children).toBeUndefined();
    const phone = CustomerPhoneLink({ customer, contact: customer.contacts[0]! })!;
    const event = { stopPropagation: vi.fn(), preventDefault: vi.fn() };
    (phone.props.onClick as (value: typeof event) => void)(event);
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    (button.props.onClick as () => void)();
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("does not render a callable link when contacts are missing", () => {
    const html = renderToStaticMarkup(CustomerCard({ customer: { ...customer, contacts: [], accessPasswordState: "unknown", accessPassword: "", deliveryLocationDescription: "" }, onSelect: vi.fn() }));
    expect(html).toContain("연락처 미등록");
    expect(html).toContain("미등록");
    expect(html).not.toContain('href="tel:');
  });

  it("distinguishes a door without a code from an unregistered code", () => {
    expect(customerPasswordLabel({ accessPasswordState: "none", accessPassword: "" })).toBe("없음");
    expect(customerPasswordLabel({ accessPasswordState: "unknown", accessPassword: "" })).toBe("미등록");
    expect(customerPasswordLabel(customer)).toBe("00123*");
  });

  it.each(["010-1234-5678", "010 1234 5678"])("preserves leading zero while sanitizing %s", (phone) => expect(customerPhoneHref(phone)).toBe("tel:01012345678"));
  it.each(["", "javascript:alert(1)", "0101234;99", "++821012345678"])("rejects invalid telephone targets %s", (phone) => expect(customerPhoneHref(phone)).toBeNull());

  it.each([true, false])("asks once before a closed-customer action (accepted=%s)", (accepted) => {
    const confirm = vi.fn(() => accepted);
    vi.stubGlobal("window", { confirm });
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    confirmClosedCustomer(event as unknown as MouseEvent<HTMLAnchorElement>, { ...customer, status: "closed" });
    expect(confirm).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("폐업"));
    expect(event.preventDefault).toHaveBeenCalledTimes(accepted ? 0 : 1);
  });

  it("retains closed status and the independent change badge", () => {
    const html = renderToStaticMarkup(CustomerCard({ customer: { ...customer, status: "closed" }, onSelect: vi.fn() }));
    expect(html).toContain("폐업");
    expect(html).toContain("정보변경");
  });

  it("keeps recent rows compact, with address and password descriptions and a decorative storefront fallback", () => {
    const select = vi.fn();
    const tree = RecentCustomerCard({ customer, onSelect: select });
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('aria-label="강은유통 다시 열기"');
    expect(html).toContain('aria-describedby="customer-recent-address-UI-CUSTOMER customer-recent-password-UI-CUSTOMER"');
    expect(html).toContain('id="customer-recent-address-UI-CUSTOMER"');
    expect(html).toContain('id="customer-recent-password-UI-CUSTOMER"');
    expect(html).toContain('data-customer-photo="placeholder"');
    expect(html).toContain("실제 납품 주소");
    expect(html).toContain("00123*");
    expect(html.match(/<button\b/g)).toHaveLength(1);
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("<img");
    expect(html).not.toContain('href="tel:');
    (all(tree)[0]!.props.onClick as () => void)();
    expect(select).toHaveBeenCalledOnce();
  });

  it("does not load photos for general search-result cards even when metadata is present", () => {
    const html = renderToStaticMarkup(CustomerCard({ customer: { ...customer, overviewPhoto: { photoId: "00000000-0000-4000-8000-000000000000", width: 640, height: 400 } }, onSelect: vi.fn() }));
    expect(html).not.toContain("data-customer-photo");
    expect(html).not.toContain("<img");
  });

  it("opens directions independently without opening detail", () => {
    const link = CustomerCardDirectionsLink({ customer });
    expect(link.props.href).toBe(`https://map.kakao.com/link/to/${encodeURIComponent(customer.name)},36.35,127.38`);
    expect(link.props.target).toBe("_blank");
    expect(link.props.rel).toBe("noopener noreferrer");
    const event = { stopPropagation: vi.fn(), preventDefault: vi.fn() };
    link.props.onClick(event);
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("does not guess a destination for missing or malformed unloading pins", () => {
    expect(customerDirectionsHref({ ...customer, deliveryPoint: null })).toBeNull();
    expect(customerDirectionsHref({ ...customer, deliveryPoint: { latitude: NaN, longitude: 127 } })).toBeNull();
    expect(customerDirectionsHref({ ...customer, deliveryPoint: { latitude: 91, longitude: 127 } })).toBeNull();
    const html = renderToStaticMarkup(CustomerCardDirectionsLink({ customer: { ...customer, deliveryPoint: null } }));
    expect(html).toContain("위치 미등록");
    expect(html).not.toContain("href=");
  });

  it("keeps directory rows compact while retaining independent phone and directions targets", () => {
    const html = renderToStaticMarkup(CustomerCard({ customer, compact: true, onSelect: vi.fn() }));
    expect(html).toContain("00123*");
    expect(html).toContain('aria-describedby="customer-card-password-UI-CUSTOMER"');
    expect(html).toContain('id="customer-card-password-UI-CUSTOMER"');
    expect(html).toContain("실제 납품 주소");
    expect(html).toContain("납품지 길안내");
    expect(html).toContain("tel:01012345678");
  });

  it("does not duplicate the existing password information in ordinary search results", () => {
    const html = renderToStaticMarkup(CustomerCard({ customer, onSelect: vi.fn() }));
    expect(html.match(/출입비번/g)).toHaveLength(1);
    expect(html.match(/00123\*/g)).toHaveLength(1);
    expect(html).not.toContain("data-customer-password-summary");
    expect(html).not.toContain("customer-card-password-");
    expect(html).toContain("납품위치");
  });

  it("uses separate password description IDs when the same customer appears in recent and directory lists", () => {
    const recent = renderToStaticMarkup(RecentCustomerCard({ customer, onSelect: vi.fn() }));
    const directory = renderToStaticMarkup(CustomerCard({ customer, compact: true, onSelect: vi.fn() }));
    const ids = [...`${recent}${directory}`.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toContain("customer-recent-password-UI-CUSTOMER");
    expect(ids).toContain("customer-card-password-UI-CUSTOMER");
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe.each(["recent", "directory"] as const)("%s password summary", (variant) => {
    it.each([
      { state: "registered", password: "00123*", expected: "00123*" },
      { state: "registered", password: "0", expected: "0" },
      { state: "registered", password: "#*<>&\"'09", expected: "#*<>&\"'09" },
      { state: "none", password: "STALE-NONE-00123*", expected: "없음" },
      { state: "unknown", password: "STALE-UNKNOWN-00123*", expected: "미등록" },
      { state: "registered", password: "", expected: "미등록" },
    ] as const)("renders $state / $password as $expected without stale values", ({ state, password, expected }) => {
      const value: Customer = { ...customer, accessPasswordState: state, accessPassword: password };
      const html = renderToStaticMarkup(variant === "recent"
        ? RecentCustomerCard({ customer: value, onSelect: vi.fn() })
        : CustomerCard({ customer: value, compact: true, onSelect: vi.fn() }));
      expect(html.match(/data-customer-password-summary="true"/g)).toHaveLength(1);
      expect(html.match(/출입비번/g)).toHaveLength(1);
      expect(html).toContain(`<strong>${renderToStaticMarkup(expected)}</strong>`);
      if (password !== expected && password) expect(html).not.toContain(password);
      if (password.includes("<")) expect(html).not.toContain(password);
    });
  });
});
