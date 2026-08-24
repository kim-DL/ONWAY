export const PHASE3_TEST_PINS = {
  delivery: "482915",
  salesA: "258714",
  salesB: "690347",
  salesC: "817426",
  disabled: "731846",
} as const;

export const PHASE3_TEST_IDENTITIES = [
  { employeeId: "EMP-DELIVERY", pin: PHASE3_TEST_PINS.delivery },
  { employeeId: "EMP-SALES-A", pin: PHASE3_TEST_PINS.salesA },
  { employeeId: "EMP-SALES-B", pin: PHASE3_TEST_PINS.salesB },
  { employeeId: "EMP-SALES-C", pin: PHASE3_TEST_PINS.salesC },
  { employeeId: "EMP-DISABLED", pin: PHASE3_TEST_PINS.disabled },
] as const;
