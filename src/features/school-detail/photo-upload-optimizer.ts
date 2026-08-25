export const PHOTO_SOURCE_MAX_BYTES = 30 * 1024 * 1024;
export const PHOTO_UPLOAD_TARGET_EDGE = 2_560;
export const PHOTO_UPLOAD_OPTIMIZE_THRESHOLD_BYTES = 1_500_000;

export type PhotoDimensions = { width: number; height: number };

export function calculateOptimizedDimensions(
  dimensions: PhotoDimensions,
  maximumEdge = PHOTO_UPLOAD_TARGET_EDGE,
): PhotoDimensions {
  if (
    !Number.isFinite(dimensions.width)
    || !Number.isFinite(dimensions.height)
    || dimensions.width <= 0
    || dimensions.height <= 0
    || !Number.isFinite(maximumEdge)
    || maximumEdge <= 0
  ) {
    throw new Error("사진 크기를 확인할 수 없습니다.");
  }
  const scale = Math.min(1, maximumEdge / Math.max(dimensions.width, dimensions.height));
  return {
    width: Math.max(1, Math.round(dimensions.width * scale)),
    height: Math.max(1, Math.round(dimensions.height * scale)),
  };
}

export function shouldOptimizeSchoolPhoto(input: {
  byteSize: number;
  contentType: string;
  dimensions: PhotoDimensions;
}) {
  return input.byteSize > PHOTO_UPLOAD_OPTIMIZE_THRESHOLD_BYTES
    || Math.max(input.dimensions.width, input.dimensions.height) > PHOTO_UPLOAD_TARGET_EDGE
    || !["image/jpeg", "image/png", "image/webp"].includes(input.contentType);
}

export function formatPhotoBytes(byteSize: number) {
  if (byteSize < 1_000_000) return `${Math.max(1, Math.round(byteSize / 1_000))}KB`;
  return `${(byteSize / 1_000_000).toFixed(1)}MB`;
}

type DecodedPhoto = PhotoDimensions & {
  source: CanvasImageSource;
  close: () => void;
};

async function decodePhoto(file: File): Promise<DecodedPhoto> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        width: bitmap.width,
        height: bitmap.height,
        source: bitmap,
        close: () => bitmap.close(),
      };
    } catch {
      // Safari versions without complete createImageBitmap support use this fallback.
    }
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.decoding = "async";
    image.src = objectUrl;
    await image.decode();
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      source: image,
      close: () => URL.revokeObjectURL(objectUrl),
    };
  } catch {
    URL.revokeObjectURL(objectUrl);
    throw new Error("이 기기에서 사진을 열 수 없습니다. JPEG, PNG 또는 WebP 사진을 선택해주세요.");
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("사진을 모바일 전송 크기로 줄이지 못했습니다.")),
      type,
      quality,
    );
  });
}

function optimizedFileName(originalName: string, contentType: string) {
  const stem = originalName.replace(/\.[^.]+$/u, "") || "school-photo";
  const extension = contentType === "image/webp" ? "webp" : contentType === "image/jpeg" ? "jpg" : "png";
  return `${stem}-optimized.${extension}`;
}

export type OptimizedSchoolPhoto = {
  file: File;
  originalBytes: number;
  optimized: boolean;
  width: number;
  height: number;
};

export async function optimizeSchoolPhoto(file: File): Promise<OptimizedSchoolPhoto> {
  if (!file.type.startsWith("image/") || file.size <= 0) {
    throw new Error("사진 파일을 선택해주세요.");
  }
  if (file.size > PHOTO_SOURCE_MAX_BYTES) {
    throw new Error("원본 사진은 30MB 이하여야 합니다.");
  }

  const decoded = await decodePhoto(file);
  try {
    if (!shouldOptimizeSchoolPhoto({ byteSize: file.size, contentType: file.type, dimensions: decoded })) {
      return {
        file,
        originalBytes: file.size,
        optimized: false,
        width: decoded.width,
        height: decoded.height,
      };
    }

    const target = calculateOptimizedDimensions(decoded);
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("이 기기에서 사진 최적화를 시작할 수 없습니다.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.fillStyle = "#fff";
    context.fillRect(0, 0, target.width, target.height);
    context.drawImage(decoded.source, 0, 0, target.width, target.height);

    const blob = await canvasToBlob(canvas, "image/webp", 0.82);
    const supportedType = ["image/jpeg", "image/png", "image/webp"].includes(blob.type)
      ? blob.type
      : "image/png";
    const optimizedFile = new File([blob], optimizedFileName(file.name, supportedType), {
      type: supportedType,
      lastModified: file.lastModified,
    });
    const mayKeepOriginal = ["image/jpeg", "image/png", "image/webp"].includes(file.type)
      && file.size <= 10 * 1024 * 1024
      && Math.max(decoded.width, decoded.height) <= PHOTO_UPLOAD_TARGET_EDGE;
    const selectedFile = mayKeepOriginal && optimizedFile.size >= file.size ? file : optimizedFile;
    return {
      file: selectedFile,
      originalBytes: file.size,
      optimized: selectedFile !== file,
      width: selectedFile === file ? decoded.width : target.width,
      height: selectedFile === file ? decoded.height : target.height,
    };
  } finally {
    decoded.close();
  }
}
