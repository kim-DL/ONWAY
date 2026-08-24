"use client";

import "client-only";

import { FirebaseError } from "firebase/app";
import { httpsCallable } from "firebase/functions";

import { APP_METADATA } from "@/lib/app-metadata";
import { getFirebaseClientServices } from "@/lib/firebase/client";
import {
  csvExportDownloadSchema,
  csvExportOptionsSchema,
  csvExportPreviewSchema,
  csvExportResultSchema,
  type CsvExportSelection,
} from "./csv-export-contract";

function services() {
  const value = getFirebaseClientServices();
  if (!value) throw new Error("Firebase is not configured.");
  return value;
}

export function csvExportErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    if (error.code === "functions/permission-denied") return "선택한 범위를 내보낼 권한이 없습니다.";
    if (error.code === "functions/resource-exhausted") return "내보낼 항목이 많습니다. 기간이나 필터를 좁혀주세요.";
    if (error.code === "functions/failed-precondition") return "요청 상태가 바뀌었거나 파일 보관 시간이 지났습니다.";
    if (error.code === "functions/not-found") return "CSV 파일을 찾을 수 없습니다. 다시 생성해주세요.";
  }
  return "CSV 작업을 완료하지 못했습니다. 연결을 확인하고 다시 시도해주세요.";
}

export class CsvExportRepository {
  async loadOptions() {
    const callable = httpsCallable<void, unknown>(services().functions, "getCsvExportOptions");
    return csvExportOptionsSchema.parse((await callable()).data);
  }

  async preview(selection: CsvExportSelection) {
    const callable = httpsCallable<CsvExportSelection, unknown>(services().functions, "previewCsvExport");
    return csvExportPreviewSchema.parse((await callable(selection)).data);
  }

  async generate(selection: CsvExportSelection, requestId: string) {
    const callable = httpsCallable<CsvExportSelection & { requestId: string; appVersion: string }, unknown>(services().functions, "exportCsv");
    return csvExportResultSchema.parse((await callable({ ...selection, requestId, appVersion: APP_METADATA.buildVersion })).data);
  }

  async download(jobId: string) {
    const callable = httpsCallable<{ jobId: string }, unknown>(services().functions, "downloadCsvExport");
    return csvExportDownloadSchema.parse((await callable({ jobId })).data);
  }
}

export function saveBase64File(input: { fileBase64: string; fileName: string; contentType: string }) {
  const binary = atob(input.fileBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const url = URL.createObjectURL(new Blob([bytes], { type: input.contentType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = input.fileName;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export const csvExportRepository = new CsvExportRepository();
