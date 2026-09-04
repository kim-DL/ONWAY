import { z } from "zod";

import type { SalesRouteMetric, SalesRouteNode } from "./sales-route-optimizer.js";

const kakaoRouteResponseSchema = z.object({
  routes: z.array(z.object({
    result_code: z.number().int(),
    key: z.string(),
    summary: z.object({
      distance: z.number().int().nonnegative(),
      duration: z.number().int().nonnegative(),
    }).optional(),
  }).passthrough()),
}).passthrough();

export class KakaoRouteRequestError extends Error {
  constructor(message: string, readonly haltFurtherRequests = false) {
    super(message);
    this.name = "KakaoRouteRequestError";
  }
}

export interface RoadMatrixClient {
  loadFrom(origin: SalesRouteNode, destinations: readonly SalesRouteNode[]): Promise<Map<string, SalesRouteMetric>>;
}

export class KakaoRouteClient implements RoadMatrixClient {
  constructor(
    private readonly restApiKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!restApiKey.trim()) throw new Error("Kakao REST API key is required.");
  }

  async loadFrom(origin: SalesRouteNode, destinations: readonly SalesRouteNode[]) {
    if (destinations.length === 0) return new Map<string, SalesRouteMetric>();
    const destinationByKey = new Map(destinations.map((destination, index) => [String(index), destination]));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6_000);
    try {
      const response = await this.fetcher("https://apis-navi.kakaomobility.com/v1/destinations/directions", {
        method: "POST",
        headers: {
          authorization: `KakaoAK ${this.restApiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          origin: { x: origin.longitude, y: origin.latitude },
          destinations: destinations.map((destination, index) => ({
            x: destination.longitude,
            y: destination.latitude,
            key: String(index),
          })),
          radius: 10_000,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new KakaoRouteRequestError(
          `Kakao route request failed with status ${response.status}.`,
          [401, 403, 429].includes(response.status),
        );
      }
      const parsed = kakaoRouteResponseSchema.safeParse(await response.json());
      if (!parsed.success) throw new KakaoRouteRequestError("Kakao route response was malformed.");

      const metrics = new Map<string, SalesRouteMetric>();
      for (const route of parsed.data.routes) {
        // Keys are opaque echoes of the values we sent. Numeric coercion can
        // incorrectly turn an empty/whitespace provider key into destination 0.
        const destination = destinationByKey.get(route.key);
        if (!destination || route.result_code !== 0 || !route.summary) continue;
        metrics.set(destination.schoolId, {
          fromSchoolId: origin.schoolId,
          toSchoolId: destination.schoolId,
          distanceMeters: route.summary.distance,
          durationSeconds: route.summary.duration,
          source: "road",
        });
      }
      return metrics;
    } catch (error) {
      if (error instanceof KakaoRouteRequestError) throw error;
      throw new KakaoRouteRequestError(error instanceof Error ? error.message : "Kakao route request failed.");
    } finally {
      clearTimeout(timeout);
    }
  }
}
