export type PinLoginStage = "app-check" | "credentials" | "persistence" | "token-exchange";

type PinLoginErrorKind = "security" | "network" | "rate-limited" | "invalid-credential" | "storage" | "session" | "service";

const MESSAGES: Record<PinLoginErrorKind, string> = {
  security: "앱 보안 확인을 완료하지 못했어요. 정식 앱 주소에서 다시 접속해주세요.",
  network: "연결이 원활하지 않아요. 인터넷 연결을 확인한 뒤 다시 시도해주세요.",
  "rate-limited": "잠시 후 다시 시도해주세요.",
  "invalid-credential": "PIN을 확인해주세요.",
  storage: "이 브라우저에서 로그인 상태를 저장할 수 없습니다. 브라우저 설정을 확인해주세요.",
  session: "로그인 연결을 완료하지 못했어요. 잠시 후 다시 시도해주세요.",
  service: "로그인 요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.",
};

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

export function classifyPinLoginError(error: unknown, stage: PinLoginStage) {
  const code = errorCode(error);
  let kind: PinLoginErrorKind;
  if (code === "functions/resource-exhausted" || code === "auth/too-many-requests") {
    kind = "rate-limited";
  } else if (
    code === "functions/unavailable" || code === "functions/deadline-exceeded"
    || code === "auth/network-request-failed" || code === "auth/timeout"
    || code === "appCheck/fetch-network-error" || code === "appCheck/deadline-exceeded"
  ) {
    kind = "network";
  } else if (stage === "app-check" || code?.startsWith("appCheck/")) {
    kind = "security";
  } else if (stage === "credentials" && code === "functions/unauthenticated") {
    // The server deliberately shares one rejection for unknown PINs, disabled
    // employees and stale credentials. Never expose which account check failed.
    kind = "invalid-credential";
  } else if (stage === "persistence") {
    kind = "storage";
  } else if (stage === "token-exchange") {
    kind = "session";
  } else {
    kind = "service";
  }
  // Never reflect SDK messages: they can contain provider configuration or
  // account details and cannot safely identify an incorrect PIN.
  return { kind, message: MESSAGES[kind] };
}
