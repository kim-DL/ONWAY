import { describe, expect, it } from "vitest";

import {
  authzMatchesSession,
  clientAuthzSchema,
  sessionClaimsSchema,
} from "@/domain/auth";

const claims = sessionClaimsSchema.parse({
  employeeId: "EMP-DELIVERY",
  sessionVersion: 1,
  permissionsVersion: 2,
  roleScopes: ["delivery"],
});

describe("client session contract", () => {
  it("accepts only an active authz record with matching identity and versions", () => {
    const authz = clientAuthzSchema.parse({
      employeeId: "EMP-DELIVERY",
      active: true,
      sessionVersion: 1,
      permissionsVersion: 2,
    });

    expect(authzMatchesSession(authz, claims)).toBe(true);
    expect(authzMatchesSession({ ...authz, active: false }, claims)).toBe(false);
    expect(authzMatchesSession({ ...authz, sessionVersion: 2 }, claims)).toBe(false);
    expect(authzMatchesSession({ ...authz, permissionsVersion: 3 }, claims)).toBe(false);
  });

  it("rejects missing or malformed custom claims", () => {
    expect(sessionClaimsSchema.safeParse({ employeeId: "EMP-DELIVERY" }).success).toBe(false);
    expect(
      sessionClaimsSchema.safeParse({
        ...claims,
        roleScopes: ["delivery", "unknown"],
      }).success,
    ).toBe(false);
  });
});
