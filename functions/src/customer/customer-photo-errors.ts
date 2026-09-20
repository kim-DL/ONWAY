import { HttpsError } from "firebase-functions/v2/https";
import { InvalidPhotoError } from "../photo/photo-processor.js";

type PhotoOperation = "upload" | "download";
type PhotoStage = "request" | "image-processing" | "storage-write" | "storage-read";
const dependencyCodes = new Set([3, 4, 5, 7, 8, 9, 10, 13, 14, 16, 400, 401, 403, 404, 409, 412, 413, 429, 500, 502, 503, 504]);

function safeDependencyCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  return typeof error.code === "number" && dependencyCodes.has(error.code) ? error.code : undefined;
}

// Retain only an allowlisted error code and the server-selected stage. Storage
// SDK errors may contain image paths, signed request URLs or private metadata.
export class CustomerPhotoDependencyError extends Error {
  readonly upstreamCode: number | undefined;
  constructor(readonly stage: PhotoStage, error: unknown) {
    super("Customer photo dependency failed.");
    this.upstreamCode = safeDependencyCode(error);
  }
}

export async function customerPhotoOperation<T>(stage: PhotoStage, action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (error) {
    if (error instanceof HttpsError || error instanceof InvalidPhotoError) throw error;
    throw new CustomerPhotoDependencyError(stage, error);
  }
}

export function customerPhotoErrorDiagnostic(error: unknown, operation: PhotoOperation) {
  const upstreamCode = error instanceof CustomerPhotoDependencyError ? error.upstreamCode : safeDependencyCode(error);
  const stage = error instanceof CustomerPhotoDependencyError ? error.stage : error instanceof InvalidPhotoError ? "image-processing" : "request";
  const category = error instanceof InvalidPhotoError ? "invalid-image"
    : [7, 401, 403].includes(upstreamCode ?? 0) ? "dependency-permission"
    : [5, 404].includes(upstreamCode ?? 0) ? "dependency-missing"
    : [8, 429].includes(upstreamCode ?? 0) ? "dependency-quota"
    : [4, 504].includes(upstreamCode ?? 0) ? "dependency-timeout"
    : [14, 500, 502, 503].includes(upstreamCode ?? 0) ? "dependency-unavailable"
    : "internal";
  return { operation, stage, category, ...(upstreamCode === undefined ? {} : { upstreamCode }) };
}
