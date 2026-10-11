import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";
import { deliveryDateKeySchema } from "../delivery-photo/delivery-photo-contract.js";
import { DELIVERY_PHOTO_MAX_BYTES } from "../delivery-photo/delivery-photo-contract.js";
import { inventoryIdSchema } from "../inventory/inventory-contract.js";
import type { McpPrincipal } from "./authorization.js";
import { galleryInput, galleryResult, inventoryPhotoInput, inventoryPhotoResult, photoCursorSchema } from "./contracts.js";
import type { McpQueries } from "./queries.js";
import { observeResult } from "./telemetry.js";

export const PHOTO_IMAGES_MAX_BYTES = 12 * 1024 * 1024;
export const photoImagesInput = z.object({
  source: z.enum(["inventory", "delivery"]),
  query: z.string().trim().min(1).max(120).optional(),
  productId: inventoryIdSchema.optional(), customerId: inventoryIdSchema.optional(),
  employeeId: inventoryIdSchema.optional(), date: deliveryDateKeySchema.optional(),
  limit: z.number().int().min(1).max(5).default(3).describe("납품사진 최대 장수. 기본3/최대5. 상품 대표 사진은1장. 큰 파일은 바이트 한도에서 커서로 나뉩니다."),
  after: photoCursorSchema.optional(), afterId: inventoryIdSchema.nullable().default(null),
}).strict().superRefine((input, context) => {
  const id = input.source === "inventory" ? input.productId : input.customerId;
  if (Boolean(id) === Boolean(input.query)) context.addIssue({ code: "custom", message: "해당 대상 ID 또는 이름 중 하나만 지정해주세요." });
  if (input.source === "inventory" && (input.customerId || input.employeeId || input.date || input.after)
    || input.source === "delivery" && input.productId) context.addIssue({ code: "custom", message: "사진 종류에 맞는 조건을 지정해주세요." });
  if (input.after && !input.customerId || input.afterId && !input.query) context.addIssue({ code: "custom", message: "사진 커서는 거래처 ID, 검색 커서는 이름과 함께 지정해주세요." });
});
export const photoImagesResult = z.object({
  status: z.literal("ok"), retrievedAt: z.iso.datetime(), timezone: z.literal("Asia/Seoul"), source: photoImagesInput.shape.source,
  inventory: inventoryPhotoResult.omit({ status: true, retrievedAt: true, timezone: true }).nullable(),
  delivery: galleryResult.omit({ status: true, retrievedAt: true, timezone: true }).nullable(),
  photos: z.array(z.object({ photoId: z.uuid(), variant: z.enum(["preview", "evidence"]), byteSize: z.number().int().positive(),
    caption: z.string(), registeredAt: z.iso.datetime().nullable(), recordedByName: z.string().nullable(), deliveryCompletedAt: z.null() }).strict()).max(5),
  unavailablePhotoIds: z.array(z.uuid()).max(5), imageCount: z.number().int().min(0).max(5),
  totalImageBytes: z.number().int().min(0).max(PHOTO_IMAGES_MAX_BYTES), budgetLimited: z.boolean(), note: z.string(),
}).strict();

const registeredTime = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
const retentionNote = "사진 데이터는 이번 응답에 포함됩니다. 기본 이미지 표시·확대 방식은 호스트에 따라 다릅니다. 이미 전달된 사진의 대화 보관은 급식길 원본의 삭제·만료 정책과 별개입니다.";

/** Standard MCP image blocks without a widget template or a second copy in _meta.
 * No URL, upload, new storage, or client credential is needed. The host owns rendering.
 */
export async function photoImages(input: z.infer<typeof photoImagesInput>, queries: McpQueries, actor: McpPrincipal): Promise<CallToolResult> {
  const photos: z.infer<typeof photoImagesResult>["photos"] = [];
  const unavailablePhotoIds: string[] = [];
  const imageContent: CallToolResult["content"] = [];
  let totalImageBytes = 0, budgetLimited = false;
  let inventory: z.infer<typeof photoImagesResult>["inventory"] = null;
  let delivery: z.infer<typeof photoImagesResult>["delivery"] = null;
  const append = (image: { photoId: string; variant: "preview" | "evidence"; byteSize: number; contentType: "image/webp"; fileBase64: string }, caption: string,
    registeredAt: string | null, recordedByName: string | null) => {
    if (image.byteSize < 1 || image.byteSize > DELIVERY_PHOTO_MAX_BYTES || Buffer.byteLength(image.fileBase64, "base64") !== image.byteSize) {
      throw new HttpsError("failed-precondition", "Image size mismatch");
    }
    if (totalImageBytes + image.byteSize > PHOTO_IMAGES_MAX_BYTES) { budgetLimited = true; return false; }
    totalImageBytes += image.byteSize;
    photos.push({ photoId: image.photoId, variant: image.variant, byteSize: image.byteSize, caption, registeredAt, recordedByName, deliveryCompletedAt: null });
    imageContent.push({ type: "text", text: caption }, { type: "image", data: image.fileBase64, mimeType: image.contentType });
    return true;
  };
  if (input.source === "inventory") {
    const { image, ...record } = await queries.inventoryPhoto(inventoryPhotoInput.parse({ productId: input.productId, query: input.query, afterId: input.afterId, variant: "preview" }), actor);
    inventory = { ...record, photo: image ? { photoId: image.photoId, variant: image.variant, contentType: image.contentType,
      byteSize: image.byteSize, sourceWidth: image.width, sourceHeight: image.height } : null };
    if (image && record.product) {
      if (image.variant !== "preview") throw new HttpsError("failed-precondition", "Unexpected image variant");
      append({ ...image, variant: "preview" }, [record.product.name, record.product.manufacturer, record.product.specification].filter(Boolean).join(" · "), null, null);
    }
  } else {
    const gallery = await queries.customerGallery(galleryInput.parse({ customerId: input.customerId, query: input.query, date: input.date,
      employeeId: input.employeeId, limit: input.limit, after: input.after, afterId: input.afterId }), actor, false);
    const { photos: records, initialPhoto: _initial, after: _after, ...metadata } = gallery;
    void _initial; void _after; // Gallery-only fields never enter the strict native response.
    let resumeAfter = input.after ?? null;
    for (const record of records) {
      try {
        const image = await queries.photo({ photoId: record.photoId, variant: "evidence" }, actor);
        if (image.variant !== "evidence" || image.photoId !== record.photoId || image.customerId !== gallery.customerId
          || image.createdAt !== record.createdAt || input.employeeId && image.createdByEmployeeId !== input.employeeId) {
          throw new HttpsError("aborted", "Photo records changed during image lookup");
        }
        const caption = `${image.customerName ?? "거래처명 미등록"} · 등록 ${registeredTime.format(new Date(image.createdAt))} (서울) · ${image.createdByName}`;
        if (!append({ ...image, variant: "evidence" }, caption, image.createdAt, image.createdByName)) break;
      } catch (error) {
        // Only actual deleted/expired/missing photos may be omitted. Auth, storage and
        // association failures invalidate the whole response; safely() checks OAuth again.
        if (!(error instanceof HttpsError) || error.code !== "not-found") throw error;
        unavailablePhotoIds.push(record.photoId);
      }
      resumeAfter = { photoId: record.photoId, createdAt: record.createdAt };
    }
    delivery = { ...metadata, photoIds: photos.map((photo) => photo.photoId), nextCursor: budgetLimited ? resumeAfter : gallery.nextCursor,
      page: gallery.page ? { ...gallery.page, returnedCount: photos.length, ...(budgetLimited ? { hasMore: true, complete: false, stoppedBecause: "result_limit" as const } : {}) } : null,
      note: gallery.resolution !== "resolved" ? gallery.note : `${photos.length}장의 큰 사진을 응답에 포함했습니다. 등록시각은 실제 납품완료시각이 아닙니다.${unavailablePhotoIds.length ? " 조회 중 삭제·만료된 사진은 제외했습니다." : ""}${budgetLimited ? " 크기 한도에 도달했습니다. 같은 조건·customerId·nextCursor로 이어서 조회하세요." : ""}` };
  }
  const structuredContent = photoImagesResult.parse({ status: "ok", retrievedAt: new Date().toISOString(), timezone: "Asia/Seoul", source: input.source,
    inventory, delivery, photos, unavailablePhotoIds, imageCount: photos.length, totalImageBytes, budgetLimited, note: retentionNote });
  observeResult(photos.length, delivery?.page?.complete ?? delivery?.searchPage?.complete ?? inventory?.searchPage?.complete ?? true);
  return { structuredContent, content: [{ type: "text", text: JSON.stringify(structuredContent) }, ...imageContent] };
}
