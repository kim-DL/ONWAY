import { describe, expect, it, vi } from "vitest";

import {
  resolveRouteNodes,
  SalesRouteLocationError,
  type RouteSchool,
} from "../src/sales/sales-route-service.js";

const actor = { uid: "uid-sales", employeeId: "EMP-SALES" };

function school(input: {
  schoolId: string;
  trusted?: boolean;
  address?: string | null;
}): RouteSchool {
  return {
    schoolId: input.schoolId,
    name: `${input.schoolId} 학교`,
    operationalStatus: "active",
    address: { road: input.address === undefined ? `대전광역시 동구 ${input.schoolId}로 1` : input.address, jibun: null },
    location: {
      latitude: input.trusted ? 36.35 : null,
      longitude: input.trusted ? 127.38 : null,
      matchStatus: input.trusted ? "confirmed" : "unmatched",
    },
  };
}

describe("sales route on-demand location resolution", () => {
  it("keeps trusted coordinates and resolves an address-backed school", async () => {
    const resolve = vi.fn(async () => ({ ok: true as const, latitude: 36.36, longitude: 127.4 }));
    await expect(resolveRouteNodes([
      school({ schoolId: "A", trusted: true }),
      school({ schoolId: "B" }),
    ], actor, { resolve })).resolves.toEqual([
      { schoolId: "A", name: "A 학교", latitude: 36.35, longitude: 127.38 },
      { schoolId: "B", name: "B 학교", latitude: 36.36, longitude: 127.4 },
    ]);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith("B", actor);
  });

  it("reports a provider outage separately and never resolves a missing address", async () => {
    const resolve = vi.fn(async () => ({ ok: false as const, reason: "provider-unavailable" as const }));
    try {
      await resolveRouteNodes([
        school({ schoolId: "A" }),
        school({ schoolId: "B", address: null }),
      ], actor, { resolve });
      throw new Error("Expected route location resolution to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(SalesRouteLocationError);
      expect(error).toMatchObject({ reason: "provider-unavailable" });
      expect(new Set((error as SalesRouteLocationError).schoolIds)).toEqual(new Set(["A", "B"]));
    }
    expect(resolve).toHaveBeenCalledTimes(1);
  });
});
