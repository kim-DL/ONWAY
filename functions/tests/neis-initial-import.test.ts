import { describe, expect, it, vi } from "vitest";

import { schoolSchema } from "../../src/domain/school";
import { neisSchoolRowSchema, type NeisSchoolRow } from "../src/neis/contract";
import {
  buildInitialSchoolImportPlan,
  InitialImportValidationError,
  InitialSchoolImportService,
} from "../src/neis/initial-import-service";
import {
  NeisClient,
  NeisClientError,
  type NeisFetcher,
} from "../src/neis/neis-client";

const SYNCED_AT = new Date("2026-08-23T12:00:00.000Z");

function row(overrides: Partial<Record<string, unknown>> = {}): NeisSchoolRow {
  return neisSchoolRowSchema.parse({
    ATPT_OFCDC_SC_CODE: "G10",
    ATPT_OFCDC_SC_NM: "대전광역시교육청",
    SD_SCHUL_CODE: "G100200001",
    SCHUL_NM: " 대전  푸른초등학교 ",
    SCHUL_KND_SC_NM: "초등학교",
    LCTN_SC_NM: "대전광역시",
    ORG_RDNZC: "34100",
    ORG_RDNMA: "대전광역시 유성구 푸른로 1",
    ORG_RDNDA: "",
    ORG_TELNO: "042-200-0001",
    HMPG_ADRES: "pureun-school.example",
    ...overrides,
  });
}

function page(totalCount: number, rows: unknown[]) {
  return {
    schoolInfo: [
      {
        head: [
          { list_total_count: totalCount },
          { RESULT: { CODE: "INFO-000", MESSAGE: "정상 처리되었습니다." } },
        ],
      },
      { row: rows },
    ],
  };
}

function pageFetcher(pages: Record<string, unknown>, calls: string[]): NeisFetcher {
  return async (url) => {
    calls.push(url);
    const pageIndex = new URL(url).searchParams.get("pIndex") ?? "";
    return {
      ok: pages[pageIndex] !== undefined,
      status: pages[pageIndex] === undefined ? 404 : 200,
      json: async () => structuredClone(pages[pageIndex]),
    };
  };
}

describe("NEIS client", () => {
  it("collects every declared page with the official query parameters", async () => {
    const calls: string[] = [];
    const rows = [
      row(),
      row({ SD_SCHUL_CODE: "G100200002", SCHUL_NM: "대전푸른중학교", SCHUL_KND_SC_NM: "중학교" }),
      row({ SD_SCHUL_CODE: "G100200003", SCHUL_NM: "대전푸른고등학교", SCHUL_KND_SC_NM: "고등학교" }),
    ];
    const client = new NeisClient({
      apiKey: "server-secret-key",
      targetEducationOfficeCode: "G10",
      pageSize: 2,
      fetcher: pageFetcher({ "1": page(3, rows.slice(0, 2)), "2": page(3, rows.slice(2)) }, calls),
    });

    await expect(client.fetchAllSchools()).resolves.toHaveLength(3);
    expect(calls).toHaveLength(2);
    const firstRequest = new URL(calls[0] ?? "");
    expect(firstRequest.pathname).toBe("/hub/schoolInfo");
    expect(firstRequest.searchParams.get("KEY")).toBe("server-secret-key");
    expect(firstRequest.searchParams.get("Type")).toBe("json");
    expect(firstRequest.searchParams.get("pIndex")).toBe("1");
    expect(firstRequest.searchParams.get("pSize")).toBe("2");
    expect(firstRequest.searchParams.get("ATPT_OFCDC_SC_CODE")).toBe("G10");
  });

  it("rejects partial page sets instead of treating them as the full school list", async () => {
    const client = new NeisClient({
      apiKey: "server-secret-key",
      targetEducationOfficeCode: "G10",
      pageSize: 2,
      fetcher: pageFetcher({ "1": page(3, [row(), row({ SD_SCHUL_CODE: "G100200002" })]), "2": page(3, []) }, []),
    });

    await expect(client.fetchAllSchools()).rejects.toMatchObject<Partial<NeisClientError>>({
      kind: "PARTIAL_RESPONSE",
    });
  });

  it("rejects malformed rows and API result errors", async () => {
    const malformedClient = new NeisClient({
      apiKey: "server-secret-key",
      targetEducationOfficeCode: "G10",
      fetcher: pageFetcher({ "1": page(1, [{ SD_SCHUL_CODE: "G100200001" }]) }, []),
    });
    await expect(malformedClient.fetchAllSchools()).rejects.toMatchObject({ kind: "INVALID_RESPONSE" });

    const rejectedClient = new NeisClient({
      apiKey: "server-secret-key",
      targetEducationOfficeCode: "G10",
      fetcher: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ RESULT: { CODE: "ERROR-300", MESSAGE: "인증 오류" } }),
      }),
    });
    await expect(rejectedClient.fetchAllSchools()).rejects.toMatchObject({ kind: "API_ERROR" });
  });
});

describe("NEIS initial school import", () => {
  it("filters other regions and non-MVP school types while producing valid stable school documents", () => {
    const rows = [
      row(),
      row({
        SD_SCHUL_CODE: "G100200002",
        SCHUL_NM: "대전한빛중학교",
        SCHUL_KND_SC_NM: "중학교",
        ORG_RDNMA: "대전광역시 중구 한빛로 2",
      }),
      row({ SD_SCHUL_CODE: "G100200003", SCHUL_KND_SC_NM: "특수학교" }),
      row({ ATPT_OFCDC_SC_CODE: "B10", SD_SCHUL_CODE: "B100200004" }),
    ];

    const plan = buildInitialSchoolImportPlan(rows, {
      targetEducationOfficeCode: "G10",
      syncedAt: SYNCED_AT,
    });

    expect(plan).toMatchObject({ sourceCount: 4, importedCount: 2, filteredOutCount: 2 });
    expect(plan.schools.map((school) => school.schoolId)).toEqual([
      "SCH-NEIS-G100200001",
      "SCH-NEIS-G100200002",
    ]);
    expect(plan.schools[0]).toMatchObject({
      name: "대전 푸른초등학교",
      normalizedName: "대전푸른초등학교",
      aliases: [],
      district: "yuseong",
      homepage: "https://pureun-school.example/",
      location: { matchStatus: "unmatched" },
    });
    expect(plan.schools.every((school) => schoolSchema.safeParse(school).success)).toBe(true);
  });

  it("rejects duplicate school codes and invalid Daejeon addresses before repository writes", async () => {
    expect(() => buildInitialSchoolImportPlan([row(), row()], {
      targetEducationOfficeCode: "G10",
      syncedAt: SYNCED_AT,
    })).toThrow(InitialImportValidationError);

    const repository = { applyInitialImport: vi.fn(async () => undefined) };
    const service = new InitialSchoolImportService({
      client: { fetchAllSchools: async () => [row({ ORG_RDNMA: "서울특별시 종로구 외부로 1" })] },
      repository,
      targetEducationOfficeCode: "G10",
      now: () => SYNCED_AT,
      runIdFactory: () => "RUN-INVALID",
    });

    await expect(service.execute("SYSTEM-TEST")).rejects.toBeInstanceOf(InitialImportValidationError);
    expect(repository.applyInitialImport).not.toHaveBeenCalled();
  });

  it("applies one validated plan with deterministic execution metadata", async () => {
    const repository = { applyInitialImport: vi.fn(async () => undefined) };
    const service = new InitialSchoolImportService({
      client: { fetchAllSchools: async () => [row()] },
      repository,
      targetEducationOfficeCode: "G10",
      now: () => SYNCED_AT,
      runIdFactory: () => "RUN-INITIAL-001",
    });

    await expect(service.execute("SYSTEM-TEST")).resolves.toMatchObject({
      runId: "RUN-INITIAL-001",
      importedCount: 1,
    });
    expect(repository.applyInitialImport).toHaveBeenCalledWith(expect.objectContaining({
      runId: "RUN-INITIAL-001",
      requestedBy: "SYSTEM-TEST",
      completedAt: SYNCED_AT,
    }));
  });
});
