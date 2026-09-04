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
    // Use the coordinate persisted by the transaction, including an existing
    // administrator-confirmed location, rather than inferring it from search rank.
    const candidate = result.acceptedLocation;
    if (
      !candidate
      || !Number.isFinite(candidate.latitude)
      || !Number.isFinite(candidate.longitude)
      || candidate.latitude < 36 || candidate.latitude > 36.7
      || candidate.longitude < 127.1 || candidate.longitude > 127.7
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
