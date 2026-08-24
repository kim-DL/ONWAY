import { z } from "zod";

import {
  neisResultSchema,
  neisSchoolRowSchema,
  type NeisSchoolPage,
  type NeisSchoolRow,
} from "./contract.js";

const DEFAULT_ENDPOINT = "https://open.neis.go.kr/hub/schoolInfo";
const DEFAULT_PAGE_SIZE = 1_000;
const DEFAULT_MAX_PAGES = 20;

const responseEnvelopeSchema = z.object({
  schoolInfo: z.array(z.unknown()).min(1),
});

const topLevelResultSchema = z.object({ RESULT: neisResultSchema });
const totalCountSchema = z.coerce.number().int().nonnegative();

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export class NeisClientError extends Error {
  constructor(
    readonly kind:
      | "API_ERROR"
      | "HTTP_ERROR"
      | "INVALID_RESPONSE"
      | "PARTIAL_RESPONSE"
      | "PAGINATION_LIMIT",
    message: string,
  ) {
    super(message);
    this.name = "NeisClientError";
  }
}

export interface NeisFetchResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

export type NeisFetcher = (url: string) => Promise<NeisFetchResponse>;

export interface NeisClientOptions {
  apiKey: string;
  targetEducationOfficeCode: string;
  pageSize?: number;
  maxPages?: number;
  fetcher?: NeisFetcher;
}

function parseResult(value: unknown) {
  if (!isRecord(value) || !("RESULT" in value)) return null;
  return neisResultSchema.safeParse(value.RESULT);
}

export function parseNeisSchoolPage(payload: unknown): NeisSchoolPage {
  const topLevelResult = topLevelResultSchema.safeParse(payload);
  if (topLevelResult.success) {
    throw new NeisClientError(
      "API_ERROR",
      `NEIS API rejected the request with ${topLevelResult.data.RESULT.CODE}.`,
    );
  }

  const envelope = responseEnvelopeSchema.safeParse(payload);
  if (!envelope.success) {
    throw new NeisClientError("INVALID_RESPONSE", "NEIS response envelope is invalid.");
  }

  const headBlock = envelope.data.schoolInfo.find(
    (block) => isRecord(block) && Array.isArray(block.head),
  );
  if (!isRecord(headBlock) || !Array.isArray(headBlock.head)) {
    throw new NeisClientError("INVALID_RESPONSE", "NEIS response head is missing.");
  }

  let totalCount: number | null = null;
  let resultCode: string | null = null;
  for (const entry of headBlock.head) {
    if (!isRecord(entry)) continue;
    if ("list_total_count" in entry) {
      const parsedCount = totalCountSchema.safeParse(entry.list_total_count);
      if (parsedCount.success) totalCount = parsedCount.data;
    }
    const parsedResult = parseResult(entry);
    if (parsedResult?.success) resultCode = parsedResult.data.CODE;
  }

  if (resultCode !== "INFO-000") {
    throw new NeisClientError("API_ERROR", `NEIS API returned ${resultCode ?? "an unknown result"}.`);
  }
  if (totalCount === null) {
    throw new NeisClientError("INVALID_RESPONSE", "NEIS total count is missing.");
  }

  const rowBlock = envelope.data.schoolInfo.find(
    (block) => isRecord(block) && Array.isArray(block.row),
  );
  const rawRows = isRecord(rowBlock) && Array.isArray(rowBlock.row) ? rowBlock.row : [];
  const parsedRows = neisSchoolRowSchema.array().safeParse(rawRows);
  if (!parsedRows.success) {
    throw new NeisClientError("INVALID_RESPONSE", "NEIS school rows failed validation.");
  }

  return { totalCount, rows: parsedRows.data };
}

export class NeisClient {
  private readonly apiKey: string;
  private readonly targetEducationOfficeCode: string;
  private readonly pageSize: number;
  private readonly maxPages: number;
  private readonly fetcher: NeisFetcher;

  constructor(options: NeisClientOptions) {
    this.apiKey = options.apiKey.trim();
    this.targetEducationOfficeCode = options.targetEducationOfficeCode.trim();
    this.pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    this.maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
    this.fetcher = options.fetcher ?? (async (url) => fetch(url));

    if (!this.apiKey) throw new Error("NEIS API key is required.");
    if (!this.targetEducationOfficeCode) {
      throw new Error("TARGET_EDUCATION_OFFICE_CODE is required.");
    }
    if (!Number.isInteger(this.pageSize) || this.pageSize < 1 || this.pageSize > 1_000) {
      throw new Error("NEIS page size must be an integer from 1 to 1000.");
    }
    if (!Number.isInteger(this.maxPages) || this.maxPages < 1) {
      throw new Error("NEIS max pages must be a positive integer.");
    }
  }

  private async fetchPage(pageIndex: number): Promise<NeisSchoolPage> {
    const url = new URL(DEFAULT_ENDPOINT);
    url.searchParams.set("KEY", this.apiKey);
    url.searchParams.set("Type", "json");
    url.searchParams.set("pIndex", String(pageIndex));
    url.searchParams.set("pSize", String(this.pageSize));
    url.searchParams.set("ATPT_OFCDC_SC_CODE", this.targetEducationOfficeCode);

    let response: NeisFetchResponse;
    try {
      response = await this.fetcher(url.toString());
    } catch {
      throw new NeisClientError("HTTP_ERROR", "NEIS request failed.");
    }
    if (!response.ok) {
      throw new NeisClientError("HTTP_ERROR", `NEIS request failed with HTTP ${response.status}.`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new NeisClientError("INVALID_RESPONSE", "NEIS response is not valid JSON.");
    }
    return parseNeisSchoolPage(payload);
  }

  async fetchAllSchools(): Promise<NeisSchoolRow[]> {
    const firstPage = await this.fetchPage(1);
    if (firstPage.totalCount === 0) return [];

    const pageCount = Math.ceil(firstPage.totalCount / this.pageSize);
    if (pageCount > this.maxPages) {
      throw new NeisClientError("PAGINATION_LIMIT", "NEIS response exceeds the paging safety limit.");
    }

    const rows = [...firstPage.rows];
    for (let pageIndex = 2; pageIndex <= pageCount; pageIndex += 1) {
      const page = await this.fetchPage(pageIndex);
      if (page.totalCount !== firstPage.totalCount) {
        throw new NeisClientError("PARTIAL_RESPONSE", "NEIS total count changed while paging.");
      }
      rows.push(...page.rows);
    }

    if (rows.length !== firstPage.totalCount) {
      throw new NeisClientError(
        "PARTIAL_RESPONSE",
        `NEIS returned ${rows.length} of ${firstPage.totalCount} expected rows.`,
      );
    }
    return rows;
  }
}
