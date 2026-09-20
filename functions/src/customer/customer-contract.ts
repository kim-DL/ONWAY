import { z } from "zod";
import { isValidPhoneNumber } from "../shared/phone-number.js";

// Pure wire contract: deliberately contains no Admin SDK/runtime imports so the
// app and Functions validate the same sensitive fields without schema drift.
export const CUSTOMER_COMPANY_ID = "onnuri" as const;
export const CUSTOMER_COLLECTION_PATH = `companies/${CUSTOMER_COMPANY_ID}/customers`;
const idSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const shortText = z.string().trim().max(120);
const addressText = z.string().trim().max(500);
export const customerPointSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
}).strict();
export const customerContactSchema = z.object({
  id: idSchema,
  name: z.string().trim().max(241),
  role: shortText,
  phoneNumber: z.string().trim().max(30).regex(/^[0-9+() .-]*$/u)
    .refine((value) => !value || isValidPhoneNumber(value), "연락처를 확인해주세요."),
  isPrimary: z.boolean(),
}).strict();
export const customerDraftSchema = z.object({
  name: z.string().trim().min(1, "거래처명을 입력해주세요.").max(120)
    .refine((value) => normalizeCustomerName(value).length > 0, "거래처명을 확인해주세요."),
  district: shortText,
  administrativeDong: shortText,
  officialAddress: addressText,
  deliveryAddress: addressText,
  accessPassword: z.string().max(120),
  accessPasswordState: z.enum(["registered", "none", "unknown"]),
  deliveryLocationDescription: z.string().trim().max(2_000),
  deliveryPoint: customerPointSchema.nullable(),
  contacts: z.array(customerContactSchema).max(10)
    .refine((items) => new Set(items.map((item) => item.id)).size === items.length, "연락처 식별자가 중복되었습니다.")
    .refine((items) => items.length === 0 || items.filter((item) => item.isPrimary).length === 1, "대표 연락처를 하나 선택해주세요."),
  status: z.enum(["active", "closed"]),
  noticeType: z.enum(["none", "new", "changed"]),
  changeNote: z.string().trim().max(1_000),
}).strict().superRefine((draft, context) => {
  if ((draft.accessPasswordState === "registered") !== (draft.accessPassword.trim().length > 0)) {
    context.addIssue({ code: "custom", path: ["accessPassword"], message: "출입 비밀번호와 등록 상태를 확인해주세요." });
  }
});
export const CUSTOMER_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const CUSTOMER_PHOTO_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const customerOverviewPhotoSchema = z.object({
  photoId: z.uuid(), width: z.number().int().positive().max(2560), height: z.number().int().positive().max(2560),
}).strict();
export const uploadCustomerPhotoInputSchema = z.object({
  uploadId: z.uuid(), contentType: z.enum(CUSTOMER_PHOTO_CONTENT_TYPES),
  fileBase64: z.string().min(4).max(Math.ceil(CUSTOMER_PHOTO_MAX_BYTES * 4 / 3) + 8),
}).strict();
export const customerPhotoUploadResultSchema = z.object({
  uploadId: z.uuid(), width: z.number().int().positive().max(2560), height: z.number().int().positive().max(2560),
}).strict();
export const getCustomerPhotoInputSchema = z.object({
  customerId: idSchema, photoId: z.uuid(), variant: z.enum(["thumbnail", "preview"]).default("preview"),
}).strict();
export const customerPhotoDownloadSchema = z.object({
  contentType: z.literal("image/webp"), byteSize: z.number().int().positive().max(CUSTOMER_PHOTO_MAX_BYTES),
  fileBase64: z.string().min(4).max(Math.ceil(CUSTOMER_PHOTO_MAX_BYTES * 4 / 3) + 8),
}).strict();
export const customerSchema = customerDraftSchema.safeExtend({
  customerId: idSchema,
  companyId: z.literal(CUSTOMER_COMPANY_ID),
  normalizedName: z.string().min(1).max(240),
  choseongName: z.string().min(1).max(240),
  revision: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  createdBy: idSchema,
  updatedAt: z.iso.datetime(),
  updatedBy: idSchema,
  overviewPhoto: customerOverviewPhotoSchema.nullable().optional(),
});
export const saveCustomerInputSchema = z.object({
  requestId: z.uuid(),
  customerId: idSchema.nullable(),
  expectedRevision: z.number().int().positive().nullable(),
  draft: customerDraftSchema,
  clearNotice: z.boolean(),
  includeOverviewPhoto: z.boolean().optional(),
  photoChange: z.discriminatedUnion("action", [
    z.object({ action: z.literal("replace"), uploadId: z.uuid() }).strict(),
    z.object({ action: z.literal("remove") }).strict(),
  ]).optional(),
}).strict().refine((input) => (input.customerId === null) === (input.expectedRevision === null), "수정 버전을 확인해주세요.");
export const customerListInputSchema = z.object({ afterId: idSchema.nullable().default(null), includeOverviewPhoto: z.boolean().optional() }).strict();
export const customerListPageSchema = z.object({ customers: z.array(customerSchema).max(250), nextCursor: idSchema.nullable() }).strict();
export const customerLocationCandidateSchema = z.object({
  id: z.string().min(1).max(160), name: z.string().max(300), address: addressText, point: customerPointSchema,
}).strict();
export const customerRegionSchema = z.object({ district: shortText, administrativeDong: shortText, address: addressText }).strict();
export type Customer = z.infer<typeof customerSchema>;
export type CustomerDraft = z.infer<typeof customerDraftSchema>;
export type CustomerContact = z.infer<typeof customerContactSchema>;
export type CustomerPoint = z.infer<typeof customerPointSchema>;
export type SaveCustomerInput = z.infer<typeof saveCustomerInputSchema>;
export type LocationCandidate = z.infer<typeof customerLocationCandidateSchema>;
export type CustomerRegion = z.infer<typeof customerRegionSchema>;

const CHOSEONG = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
export function normalizeCustomerName(value: string): string {
  // NFC preserves compatibility consonants used by Korean keyboards (NFKC
  // would turn ㄱ into a different character from extracted Hangul initials).
  return value.normalize("NFC").toLocaleLowerCase("ko-KR").replace(/[\p{P}\p{S}\s]/gu, "");
}
export function getCustomerChoseong(value: string): string {
  return Array.from(normalizeCustomerName(value), (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code >= 0xac00 && code <= 0xd7a3 ? CHOSEONG[Math.floor((code - 0xac00) / 588)]! : character;
  }).join("");
}
