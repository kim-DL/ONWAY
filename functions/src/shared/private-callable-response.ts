import type { CallableRequest } from "firebase-functions/v2/https";

export function setPrivateCallableResponse(request: CallableRequest<unknown>): void {
  request.rawRequest.res?.setHeader("Cache-Control", "private, no-store, max-age=0");
  request.rawRequest.res?.setHeader("Pragma", "no-cache");
}
