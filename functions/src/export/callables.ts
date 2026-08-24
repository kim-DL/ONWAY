import { logger } from "firebase-functions";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { z } from "zod";

import { requireVerifiedAdmin } from "../admin/admin-authorization.js";
import { LoginRepository } from "../auth/login-repository.js";
import { claimsMatchAuthz } from "../auth/login-service.js";
import { getAdminFirestore } from "../shared/firebase-admin.js";
import { downloadCsvExportInputSchema, exportCsvInputSchema, previewCsvExportInputSchema } from "./csv-export-contract.js";
import {
  CsvExportExpiredError, CsvExportNotFoundError, CsvExportPermissionError, CsvExportRequestCollisionError,
  CsvExportService, CsvExportTooLargeError, loadCsvExportActor,
} from "./csv-export-service.js";

function isFunctionsEmulator() { return process.env.FUNCTIONS_EMULATOR === "true"; }

async function authorize(request: CallableRequest<unknown>) {
  if (!request.auth) throw new HttpsError("unauthenticated", "인증이 필요합니다.");
  const authz = await new LoginRepository().getAuthz(request.auth.uid);
  if (!authz || !claimsMatchAuthz(request.auth.token, authz)) throw new HttpsError("failed-precondition", "세션이 유효하지 않습니다.");
  if (!authz.roleScopes.some((scope) => scope === "sales" || scope === "admin")) throw new HttpsError("permission-denied", "CSV 내보내기 권한이 없습니다.");
  if (authz.roleScopes.includes("admin")) await requireVerifiedAdmin(request);
  return loadCsvExportActor(getAdminFirestore(), request.auth.uid, authz.employeeId, authz.roleScopes);
}

function mapError(error: unknown): HttpsError | null {
  if (error instanceof CsvExportPermissionError) return new HttpsError("permission-denied", error.message || "CSV 내보내기 권한이 없습니다.");
  if (error instanceof CsvExportRequestCollisionError) return new HttpsError("already-exists", "요청 식별자가 이미 다른 내보내기에 사용되었습니다.");
  if (error instanceof CsvExportTooLargeError) return new HttpsError("resource-exhausted", error.message || "CSV 크기 제한을 초과했습니다.");
  if (error instanceof CsvExportNotFoundError) return new HttpsError("not-found", error.message || "CSV 파일을 찾을 수 없습니다.");
  if (error instanceof CsvExportExpiredError) return new HttpsError("failed-precondition", "CSV 파일의 보관 시간이 지났습니다. 다시 생성해주세요.");
  if (error instanceof z.ZodError) return new HttpsError("failed-precondition", "저장된 CSV 내보내기 계약이 올바르지 않습니다.");
  return null;
}

const readOptions = { enforceAppCheck: !isFunctionsEmulator(), maxInstances: 20, region: "asia-northeast3" as const };
const writeOptions = { enforceAppCheck: !isFunctionsEmulator(), maxInstances: 6, memory: "512MiB" as const, timeoutSeconds: 120, region: "asia-northeast3" as const };

export const getCsvExportOptions = onCall(readOptions, async (request) => {
  const actor = await authorize(request);
  try { return await new CsvExportService().options(actor); }
  catch (error) { const mapped = mapError(error); if (mapped) throw mapped; logger.error("CSV options failed.", { actor: actor.employeeId, error }); throw new HttpsError("internal", "내보내기 기준을 불러오지 못했습니다."); }
});

export const previewCsvExport = onCall(readOptions, async (request) => {
  const parsed = previewCsvExportInputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "CSV 필터를 확인해주세요.");
  const actor = await authorize(request);
  try { return await new CsvExportService().preview(parsed.data, actor); }
  catch (error) { const mapped = mapError(error); if (mapped) throw mapped; logger.error("CSV preview failed.", { actor: actor.employeeId, error }); throw new HttpsError("internal", "CSV 미리보기를 만들지 못했습니다."); }
});

export const exportCsv = onCall(writeOptions, async (request) => {
  const parsed = exportCsvInputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "CSV 생성 요청을 확인해주세요.");
  const actor = await authorize(request);
  try { return await new CsvExportService().generate(parsed.data, actor); }
  catch (error) { const mapped = mapError(error); if (mapped) throw mapped; logger.error("CSV generation failed.", { actor: actor.employeeId, requestId: parsed.data.requestId, error }); throw new HttpsError("internal", "CSV 파일을 만들지 못했습니다."); }
});

export const downloadCsvExport = onCall(writeOptions, async (request) => {
  const parsed = downloadCsvExportInputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "CSV 파일 요청을 확인해주세요.");
  const actor = await authorize(request);
  try { return await new CsvExportService().download(parsed.data.jobId, actor); }
  catch (error) { const mapped = mapError(error); if (mapped) throw mapped; logger.error("CSV download failed.", { actor: actor.employeeId, jobId: parsed.data.jobId, error }); throw new HttpsError("internal", "CSV 파일을 열지 못했습니다."); }
});

export const expireCsvExports = onSchedule(
  { schedule: "every 60 minutes", timeZone: "Asia/Seoul", region: "asia-northeast3", maxInstances: 1 },
  async () => {
    try {
      const result = await new CsvExportService().expireCompleted();
      if (result.expiredCount > 0) logger.info("Expired CSV exports removed.", result);
    } catch (error) {
      logger.error("CSV expiration cleanup failed.", { error });
      throw error;
    }
  },
);
