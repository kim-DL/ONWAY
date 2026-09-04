import { randomUUID } from "node:crypto";

import type { KakaoMatchService } from "../sync/kakao-match-service.js";
import type {
  SalesRouteActor,
  SalesRouteLocationResolver,
  SalesRouteLocationResolution,
} from "./sales-route-service.js";

type KakaoMatcher = Pick<KakaoMatchService, "match">;

function unresolved(reason: string): SalesRouteLocationResolution {
  return {
    ok: false,
    reason: reason === "KAKAO_API_FAILURE" ? "provider-unavailable" : "review-required",
  };
}

export class KakaoRouteLocationResolver implements SalesRouteLocationResolver {
  constructor(private readonly matcher: KakaoMatcher) {}

  async resolve(schoolId: string, actor: SalesRouteActor): Promise<SalesRouteLocationResolution> {
    const result = await this.matcher.match({
      schoolId,
      requestId: randomUUID(),
    }, actor);
    if (result.status !== "autoMatched" && result.status !== "confirmed") {
      return unresolved(result.reason);
    }
    // KakaoMatchService persists the decision candidate first after score sorting.
    // Keep that exact ordering here instead of selecting an arbitrary regional result.
    const candidate = result.candidates[0];
    if (
      !candidate
      || !candidate.regionValid
      || !Number.isFinite(candidate.latitude)
      || !Number.isFinite(candidate.longitude)
    ) {
      return unresolved(result.reason);
    }
    return {
      ok: true,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
    };
  }
}
