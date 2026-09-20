import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatInventoryDateInput, InventoryDateField, inventoryCalendarDays, isInventoryInputDate, shiftInventoryDate, shiftInventoryMonth } from "./inventory-date-field";

describe("inventory direct date and calendar", () => {
  it.each(["2024-02-29", "2000-02-29", "2026-04-30", "0001-01-01", "9999-12-31"])("accepts an exact valid date %s", (value) => expect(isInventoryInputDate(value)).toBe(true));
  it.each(["2026-02-29", "1900-02-29", "2026-04-31", "2026-00-01", "2026-13-01", "2026-01-00", "2026-01-32", "0000-01-01", "2026-1-1", "", "not-a-date"])("rejects invalid date %s", (value) => expect(isInventoryInputDate(value)).toBe(false));
  it("formats numeric keyboard entry and keeps incomplete input editable", () => {
    expect(formatInventoryDateInput("20240913")).toBe("2024-09-13");
    expect(formatInventoryDateInput("2024-09-13")).toBe("2024-09-13");
    expect(formatInventoryDateInput("202409")).toBe("2024-09");
    expect(formatInventoryDateInput("2026-13-20")).toBe("2026-13-20");
  });
  it("clamps month/year navigation to the month's real last day", () => {
    expect(shiftInventoryMonth("2024-01-31", 1)).toBe("2024-02-29");
    expect(shiftInventoryMonth("2024-02-29", 12)).toBe("2025-02-28");
    expect(shiftInventoryMonth("2026-01-31", -1)).toBe("2025-12-31");
    expect(shiftInventoryMonth("0001-01-01", -1)).toBe("0001-01-01");
    expect(shiftInventoryMonth("9999-12-31", 1)).toBe("9999-12-31");
  });
  it("moves calendar focus over month/year boundaries without local timezone conversion", () => {
    expect(shiftInventoryDate("2024-02-28", 1)).toBe("2024-02-29");
    expect(shiftInventoryDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftInventoryDate("0001-01-01", -7)).toBe("0001-01-01");
    expect(shiftInventoryDate("9999-12-31", 7)).toBe("9999-12-31");
  });
  it("renders complete seven-day rows with exactly the actual dates", () => {
    const days = inventoryCalendarDays("2024-02-29");
    expect(days.length % 7).toBe(0);
    expect(days.filter(Boolean)).toHaveLength(29);
    expect(days.slice(0, 4)).toEqual([null, null, null, null]);
    expect(days).not.toContain("2024-02-30");
  });
  it("server-renders a labelled direct text field and separate calendar button without opening a dialog", () => {
    const html = renderToStaticMarkup(h(InventoryDateField, { label: "유통기한 날짜", value: "2024-02-29", onChange: () => undefined }));
    expect(html).toContain('type="text"');
    expect(html).toContain('inputMode="numeric"');
    expect(html).toContain('placeholder="YYYY-MM-DD"');
    expect(html).toContain('aria-label="유통기한 날짜 달력 열기, 2024-02-29"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-describedby=');
    expect(html).not.toContain("<dialog");
  });
});
