import { describe, expect, it } from "vitest";

import { greetingForHour } from "./time-greeting";

describe("greetingForHour", () => {
  it.each([
    [0, "좋은 아침이에요"],
    [10, "좋은 아침이에요"],
    [11, "힘찬 오후예요"],
    [16, "힘찬 오후예요"],
    [17, "오늘도 수고 많았어요"],
    [23, "오늘도 수고 많았어요"],
  ])("returns the expected copy at %i:00", (hour, greeting) => {
    expect(greetingForHour(hour)).toBe(greeting);
  });

  it.each([-1, 24, 9.5, Number.NaN])("rejects an invalid hour: %s", (hour) => {
    expect(() => greetingForHour(hour)).toThrow(RangeError);
  });
});
