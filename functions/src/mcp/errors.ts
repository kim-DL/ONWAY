import { HttpsError } from "firebase-functions/v2/https";
import { OAuthError } from "./oauth.js";
import type { McpErrorDetail } from "./contracts.js";
import { InventoryPhotoDependencyError } from "../inventory/inventory-photo-service.js";

/** Allowlisted messages only: SDK/Firestore errors may contain paths and source data. */
export function mcpError(error: unknown): McpErrorDetail {
  const code = error instanceof InventoryPhotoDependencyError && error.stage === "storage-read"
    ? error.upstreamCode === 404 ? "not-found" : [429, 8].includes(error.upstreamCode ?? 0) ? "resource-exhausted"
      : [500, 502, 503, 504, 4, 14].includes(error.upstreamCode ?? 0) ? "unavailable" : null
    : error instanceof OAuthError && error.status === 401 ? "unauthenticated"
    : error instanceof HttpsError ? error.code
      : error && typeof error === "object" && "code" in error ? error.code : null;
  const failure = (code: McpErrorDetail["code"], message: string, retryAfterSeconds: number | null = null): McpErrorDetail =>
    ({ code, message, retryable: retryAfterSeconds !== null, retryAfterSeconds });
  switch (code) {
    case "unauthenticated": return failure("AUTH_REQUIRED", "연결 인증이 만료되었거나 취소되었습니다. 플러그인을 다시 연결해주세요.");
    case "permission-denied": return failure("FORBIDDEN", "현재 계정으로 조회할 수 없습니다. 직원 권한을 확인해주세요.");
    case "not-found": return failure("NOT_FOUND", "자료를 찾을 수 없습니다. 삭제되었거나 사진 보관기간이 지났을 수 있습니다.");
    case "invalid-argument": return failure("INVALID_INPUT", "조회 대상과 입력 조건을 확인해주세요.");
    case "failed-precondition": return failure("INVALID_DATA", "자료 상태를 확인할 수 없습니다. 대상 자료를 다시 확인해주세요.");
    case "resource-exhausted": case 8: return failure("RATE_LIMITED", "조회 한도에 도달했습니다. 잠시 후 다시 조회해주세요.", 60);
    case "deadline-exceeded": case 4: return failure("TIMEOUT", "조회 시간이 초과되었습니다. 범위를 줄여 다시 조회해주세요.", 2);
    case "unavailable": case "aborted": case 14: case 10: return failure("TEMPORARY_UNAVAILABLE", "일시적으로 조회하지 못했습니다. 잠시 후 다시 시도해주세요.", 2);
    default: return failure("INTERNAL_ERROR", "조회 처리 중 오류가 발생했습니다. 계속되면 관리자에게 확인해주세요.");
  }
}
