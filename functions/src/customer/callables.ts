import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { z } from "zod";

import { KakaoLocalClient, KakaoLocalClientError } from "../sync/kakao-local-client.js";
import { requireCustomerActor } from "./customer-authorization.js";
import {
  customerListInputSchema, customerLocationCandidateSchema, customerPointSchema, saveCustomerInputSchema,
  type LocationCandidate,
} from "./customer-contract.js";
import { CustomerNotFound, CustomerRequestCollision, CustomerRevisionConflict, CustomerService, customerResponse } from "./customer-service.js";
import { reverseCustomerAddress } from "./customer-location.js";

const emulator = process.env.FUNCTIONS_EMULATOR === "true";
const kakaoRestApiKey = defineSecret("KAKAO_REST_API_KEY");
const options = { enforceAppCheck: !emulator, maxInstances: 10, region: "asia-northeast3" as const };
const locationOptions = { ...options, timeoutSeconds: 30, secrets: emulator ? [] : [kakaoRestApiKey] };

function preventCaching(request: CallableRequest<unknown>) {
  request.rawRequest.res?.setHeader("Cache-Control", "private, no-store, max-age=0");
  request.rawRequest.res?.setHeader("Pragma", "no-cache");
}

function safeCustomerError(error: unknown): HttpsError {
  if (error instanceof HttpsError) return error;
  if (error instanceof CustomerRevisionConflict) return new HttpsError("aborted", "다른 직원이 먼저 수정했습니다. 최신 정보를 확인해주세요.");
  if (error instanceof CustomerRequestCollision) return new HttpsError("already-exists", "요청 식별자가 이미 사용되었습니다.");
  if (error instanceof CustomerNotFound) return new HttpsError("not-found", "거래처를 찾을 수 없습니다.");
  if (error instanceof KakaoLocalClientError) return new HttpsError(
    error.httpStatus === 429 ? "resource-exhausted" : "unavailable", "지도 위치 검색에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.",
  );
  // Raw errors can contain validation inputs and upstream URLs. Never log them.
  logger.error("Customer operation failed.", { category: error instanceof z.ZodError ? "contract" : "internal" });
  return new HttpsError("internal", "거래처 요청을 처리하지 못했습니다.");
}

export const listCustomers = onCall(options, async (request) => {
  preventCaching(request);
  try {
    await requireCustomerActor(request);
    const parsed = customerListInputSchema.safeParse(request.data);
    if (!parsed.success) throw new HttpsError("invalid-argument", "목록 요청을 확인해주세요.");
    const result = await new CustomerService().list(parsed.data.afterId, parsed.data.includeOverviewPhoto);
    // Reject data read while a session was being revoked, rather than returning
    // it based only on authorization checked before the database round-trip.
    await requireCustomerActor(request);
    return result;
  } catch (error) { throw safeCustomerError(error); }
});

export const saveCustomer = onCall(options, async (request) => {
  preventCaching(request);
  try {
    const actor = await requireCustomerActor(request);
    const parsed = saveCustomerInputSchema.safeParse(request.data);
    if (!parsed.success) throw new HttpsError("invalid-argument", "거래처 입력을 확인해주세요.");
    return customerResponse(await new CustomerService().save(parsed.data, actor), parsed.data.includeOverviewPhoto);
  } catch (error) { throw safeCustomerError(error); }
});

function locationClient() {
  const key = emulator ? process.env.KAKAO_REST_API_KEY?.trim() : kakaoRestApiKey.value().trim();
  if (!key) throw new HttpsError("unavailable", "지도 검색 설정이 필요합니다. 주소와 좌표를 직접 입력할 수 있습니다.");
  return new KakaoLocalClient({ restApiKey: key });
}

export const searchCustomerLocations = onCall(locationOptions, async (request) => {
  preventCaching(request);
  try {
    await requireCustomerActor(request);
    const parsed = z.object({ query: z.string().trim().min(2).max(200) }).strict().safeParse(request.data);
    if (!parsed.success) throw new HttpsError("invalid-argument", "주소 또는 장소를 두 글자 이상 입력해주세요.");
    const client = locationClient();
    const [address, places] = await Promise.allSettled([
      client.searchAddress(parsed.data.query), client.searchKeyword({ query: parsed.data.query }),
    ]);
    if (address.status === "rejected" && places.status === "rejected") throw address.reason;
    const candidates: LocationCandidate[] = [];
    if (address.status === "fulfilled" && address.value) {
      candidates.push({
        id: "address", name: address.value.roadAddress || address.value.addressName,
        address: address.value.roadAddress || address.value.addressName,
        point: { latitude: address.value.latitude, longitude: address.value.longitude },
      });
    }
    if (places.status === "fulfilled") for (const place of places.value) {
      candidates.push({ id: `place-${place.placeId}`, name: place.name,
        address: place.roadAddress || place.addressName, point: { latitude: place.latitude, longitude: place.longitude } });
    }
    if (candidates.length === 0 && (address.status === "rejected" || places.status === "rejected")) {
      throw address.status === "rejected" ? address.reason : places.status === "rejected" ? places.reason : new Error("Location search unavailable.");
    }
    await requireCustomerActor(request);
    return z.array(customerLocationCandidateSchema).max(16).parse(candidates);
  } catch (error) { throw safeCustomerError(error); }
});

export const reverseCustomerLocation = onCall(locationOptions, async (request) => {
  preventCaching(request);
  try {
    await requireCustomerActor(request);
    const parsed = customerPointSchema.safeParse(request.data);
    if (!parsed.success) throw new HttpsError("invalid-argument", "실제 납품지점 좌표를 확인해주세요.");
    const result = await reverseCustomerAddress(locationClient(), parsed.data);
    await requireCustomerActor(request);
    return result;
  } catch (error) { throw safeCustomerError(error); }
});
