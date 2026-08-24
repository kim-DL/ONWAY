import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { z } from "zod";

import { InitialSchoolImportService } from "./initial-import-service.js";
import { NeisClient, type NeisFetcher } from "./neis-client.js";
import { SchoolImportRepository } from "./school-import-repository.js";

const fixtureSchema = z.object({
  pageSize: z.number().int().min(1).max(1_000),
  pages: z.record(z.string(), z.unknown()),
});

function argumentValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function loadFixture(path: string) {
  const payload = JSON.parse(await readFile(resolve(process.cwd(), path), "utf8")) as unknown;
  return fixtureSchema.parse(payload);
}

function fixtureFetcher(pages: Record<string, unknown>): NeisFetcher {
  return async (requestUrl) => {
    const pageIndex = new URL(requestUrl).searchParams.get("pIndex") ?? "";
    const payload = pages[pageIndex];
    return {
      ok: payload !== undefined,
      status: payload === undefined ? 404 : 200,
      json: async () => structuredClone(payload),
    };
  };
}

async function main() {
  const fixturePath = argumentValue("--fixture");
  const targetEducationOfficeCode = process.env.TARGET_EDUCATION_OFFICE_CODE?.trim();
  if (!targetEducationOfficeCode) {
    throw new Error("TARGET_EDUCATION_OFFICE_CODE is required.");
  }

  let pageSize: number | undefined;
  let fetcher: NeisFetcher | undefined;
  let apiKey = process.env.NEIS_API_KEY?.trim() ?? "";

  if (fixturePath) {
    const projectId = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? "";
    if (!process.env.FIRESTORE_EMULATOR_HOST || !projectId.startsWith("demo-")) {
      throw new Error("Fixture import is allowed only in a demo Firestore Emulator project.");
    }
    const fixture = await loadFixture(fixturePath);
    pageSize = fixture.pageSize;
    fetcher = fixtureFetcher(fixture.pages);
    apiKey = "fixture-only-key";
  } else {
    if (process.env.ALLOW_LIVE_NEIS_IMPORT !== "true") {
      throw new Error("Live NEIS import requires explicit ALLOW_LIVE_NEIS_IMPORT=true approval.");
    }
    if (!apiKey) throw new Error("NEIS_API_KEY is required for a live import.");
  }

  const client = new NeisClient({
    apiKey,
    targetEducationOfficeCode,
    ...(pageSize === undefined ? {} : { pageSize }),
    ...(fetcher === undefined ? {} : { fetcher }),
  });
  const service = new InitialSchoolImportService({
    client,
    repository: new SchoolImportRepository(),
    targetEducationOfficeCode,
  });
  const result = await service.execute("SYSTEM-INITIAL-IMPORT");

  console.log(JSON.stringify({
    runId: result.runId,
    sourceCount: result.sourceCount,
    importedCount: result.importedCount,
    filteredOutCount: result.filteredOutCount,
  }));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "NEIS initial import failed.");
  process.exitCode = 1;
});
