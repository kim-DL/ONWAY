import { INVOICE_MAX_BYTES } from "@/domain/delivery-planning";

/** Memory-only conversion. Never uses the delivery photo outbox, IndexedDB, Storage or a cache. */
export async function prepareInvoiceFile(file: File): Promise<{ contentType: "image/jpeg"; fileBase64: string }> {
  if (!/^image\/(jpeg|png|webp)$/u.test(file.type) || file.size > 20 * 1024 * 1024) throw new Error("20MB 이하의 JPEG·PNG·WebP 사진을 선택해주세요.");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const canvas = document.createElement("canvas");
  try {
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d"); if (!context) throw new Error("사진을 준비하지 못했어요.");
    context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL("image/jpeg", 0.88).split(",")[1]!;
    if (base64.length > Math.ceil(INVOICE_MAX_BYTES * 4 / 3)) throw new Error("사진이 너무 큽니다. 명세서 한 장씩 다시 촬영해주세요.");
    return { contentType: "image/jpeg", fileBase64: base64 };
  } finally { bitmap.close(); canvas.width = 0; canvas.height = 0; }
}
