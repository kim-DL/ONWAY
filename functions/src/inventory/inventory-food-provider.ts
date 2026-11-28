import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { canonicalGtin } from "./inventory-barcode-contract.js";
import { foodItemSchema, type FoodCandidate, type FoodQuery, type foodSearchResult } from "./inventory-scan-contract.js";

type Result = z.infer<typeof foodSearchResult>;
const entry = z.record(z.string(), z.unknown());
const feed = z.object({ RESULT: z.object({ CODE: z.string() }), total_count: z.coerce.number().optional(), row: z.array(entry).optional() });
const result = (status: Result["status"]): Result => ({ status, items: [], more: false });
const norm = (value: string) => value.normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase("ko");
async function readBatch(url: string, service: string, signal: AbortSignal, fetcher: typeof fetch) {
  const response = await fetcher(url, { signal, redirect: "error" });
  if (!response.ok) return null;
  const body = entry.parse(await response.json());
  return feed.parse(body[service] ?? body);
}
export async function findFoodProducts(query: FoodQuery, key: string, fetcher: typeof fetch = fetch): Promise<Result> {
  if (!key) return result("unconfigured");
  const byCode = query.by === "code";
  const service = byCode ? "C005" : "I1250";
  const queries = [query.value];
  if (byCode) {
    const canonical = canonicalGtin(query.value)!;
    for (const length of [13, 14, 12, 8]) {
      const variant = canonical.slice(-length);
      if (!queries.includes(variant) && canonicalGtin(variant) === canonical) queries.push(variant);
    }
  }
  try {
    for (const value of queries) {
      const url = "https://openapi.foodsafetykorea.go.kr/api/" + encodeURIComponent(key) + "/" + service + "/json/1/30/"
        + (byCode ? "BAR_CD=" : "PRDLST_NM=") + encodeURIComponent(value);
      const signal = AbortSignal.timeout(6500);
      let batch = await readBatch(url, service, signal, fetcher);
      if (batch?.RESULT.CODE === "INFO-500") {
        await delay(600, undefined, { signal });
        batch = await readBatch(url, service, signal, fetcher);
      }
      if (!batch) return result("unavailable");
      const code = batch.RESULT.CODE;
      if (code === "INFO-200") continue;
      if (["INFO-100", "INFO-110", "INFO-120", "INFO-400", "INFO-600"].includes(code)) return result("unconfigured");
      if (code !== "INFO-000") return result("unavailable");
      const items = new Map<string, FoodCandidate>();
      for (const row of batch.row ?? []) {
        const field = (key: string) => typeof row[key] === "string" ? row[key].trim() : "";
        if (byCode && (canonicalGtin(field("BAR_CD")) !== canonicalGtin(value) || field("END_DT") || field("CLSBIZ_DT"))) continue;
        if (!byCode && (!["아니오", "아니요", "N", "0"].includes(field("PRODUCTION")) || !norm(field("PRDLST_NM")).includes(norm(value)))) continue;
        const item = foodItemSchema.safeParse({ reportNo: field("PRDLST_REPORT_NO"), name: field("PRDLST_NM"),
          manufacturer: field("BSSH_NM"), category: field("PRDLST_DCNM") });
        if (item.success) items.set(item.data.reportNo, item.data);
      }
      const more = items.size > 6 || (batch.total_count ?? 0) > (batch.row?.length ?? 0);
      if (items.size || more) return { status: "ok", items: [...items.values()].slice(0, 6), more };
    }
    return result("ok");
  } catch { return result("unavailable"); } // A provider URL contains the secret. Never log it.
}
