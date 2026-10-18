import type { DeliveryPhotoCreateErrorCategory } from "./delivery-photo-create-repository";

export function classifyDeliveryPhotoCreateError(error: unknown): DeliveryPhotoCreateErrorCategory {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (["permission-denied", "unauthenticated"].some((suffix) => code.endsWith(suffix))) return "auth";
  if (code === "delivery-photo/invalid-response") return "permanent";
  if (["invalid-argument", "already-exists", "not-found"].some((suffix) => code.endsWith(suffix))
    || code.startsWith("delivery-photo/")) return "input";
  if (code.endsWith("failed-precondition")) return "permanent";
  if (!code || ["unavailable", "deadline-exceeded", "aborted", "resource-exhausted", "cancelled", "unknown", "internal"]
    .some((suffix) => code.endsWith(suffix))) return "retryable";
  return "permanent";
}

export function deliveryPhotoCreateErrorMessage(error: unknown): string {
  const category = classifyDeliveryPhotoCreateError(error);
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (category === "auth") return "사진 이용 권한을 확인하지 못했어요. 다시 로그인해주세요.";
  if (code.endsWith("resource-exhausted")) return "사진 요청이 많아요. 잠시 후 같은 사진으로 다시 시도해주세요.";
  if (code.endsWith("aborted")) return "같은 사진 요청을 확인하고 있어요. 잠시 후 다시 시도해주세요.";
  if (category === "retryable") return "사진 전송이 끝났는지 확인하지 못했어요. 연결을 확인하고 같은 사진으로 다시 시도해주세요.";
  if (code.endsWith("failed-precondition")) return "납품사진 저장 준비를 확인하지 못했어요. 관리자에게 알려주세요.";
  if (code.endsWith("already-exists")) return "사진 요청 정보가 달라졌어요. 사진을 다시 선택해주세요.";
  return "사진을 등록하지 못했어요. 다시 촬영하거나 지원되는 사진을 선택해주세요.";
}
