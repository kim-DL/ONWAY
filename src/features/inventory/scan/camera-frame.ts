export type AimState = "searching" | "moving" | "steady" | "dark" | "glare";

export interface AimSample {
  pixels: Uint8ClampedArray;
  settledFrames: number;
  aimStrength: number;
  focusX: number;
  focusY: number;
  state: AimState;
}

/** Only the small, central viewfinder sample is compared. No frames leave the device here. */
export function sampleAim(rgba: Uint8ClampedArray, width: number, previous?: AimSample): AimSample {
  const pixels = new Uint8ClampedArray(rgba.length / 4);
  let light = 0;
  let edges = 0;
  let movement = 0;
  let weightedX = 0;
  let weightedY = 0;
  for (let index = 0; index < pixels.length; index += 1) {
    const offset = index * 4;
    const level = (rgba[offset]! + 2 * rgba[offset + 1]! + rgba[offset + 2]!) / 4;
    pixels[index] = level;
    light += level;
    if (index % width) {
      const edge = Math.abs(level - pixels[index - 1]!);
      edges += edge;
      weightedX += edge * (index % width + 0.5) / width;
      weightedY += edge * (Math.floor(index / width) + 0.5) * width / pixels.length;
    }
    if (previous) movement += Math.abs(level - previous.pixels[index]!);
  }
  const meanLight = light / pixels.length;
  const texture = edges / pixels.length;
  const drifting = movement / pixels.length > 7;
  const settledFrames = previous && !drifting ? previous.settledFrames + 1 : 0;
  let state: AimState = "searching";
  if (meanLight < 36) state = "dark";
  else if (meanLight > 236 && texture < 6) state = "glare";
  else if (drifting) state = "moving";
  else if (texture > 2.5 && settledFrames >= 2) state = "steady";
  const aimStrength = state === "dark" || state === "glare" ? 0
    : Math.min(1, texture / 12) * Math.max(0, 1 - movement / pixels.length / 60);
  // Nudge the guide toward visible detail while keeping the whole package inside the frame.
  const focus = (weighted: number, last = 0) => last * 0.5 + (aimStrength > 0.12 ? (weighted / edges - 0.5) * 10 : 0);
  return { pixels, state, settledFrames, aimStrength, focusX: focus(weightedX, previous?.focusX), focusY: focus(weightedY, previous?.focusY) };
}

export function fitFrame(width: number, height: number, maxEdge: number) {
  if (width < 1 || height < 1) throw new Error("사진 크기를 확인하지 못했어요.");
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function drawFrame(source: CanvasImageSource, width: number, height: number, maxEdge = 2400) {
  const canvas = document.createElement("canvas");
  const fitted = fitFrame(width, height, maxEdge);
  canvas.width = fitted.width;
  canvas.height = fitted.height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("사진을 준비하지 못했어요. 카메라를 다시 열어주세요.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function abortError() { return new DOMException("촬영을 닫았어요.", "AbortError"); }

export async function frameFromFile(source: File, signal: AbortSignal) {
  if (signal.aborted) throw abortError();
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(source);
      try {
        if (signal.aborted) throw abortError();
        return drawFrame(bitmap, bitmap.width, bitmap.height);
      } finally { bitmap.close(); }
    } catch (error) { if (signal.aborted) throw error; }
  }
  const url = URL.createObjectURL(source);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        image.onload = null;
        image.onerror = null;
        signal.removeEventListener("abort", cancel);
        if (error) reject(error);
        else resolve();
      };
      const cancel = () => finish(abortError());
      image.onload = () => finish();
      image.onerror = () => finish(new Error("이 기기에서 사진을 열 수 없어요. JPEG나 PNG 사진을 선택해주세요."));
      signal.addEventListener("abort", cancel, { once: true });
      image.src = url;
    });
    return drawFrame(image, image.naturalWidth, image.naturalHeight);
  } finally { URL.revokeObjectURL(url); }
}

function jpegBlob(frame: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    frame.toBlob((blob) => {
      if (!blob || !blob.size) { reject(new Error("사진을 준비하지 못했어요. 다시 촬영해주세요.")); return; }
      resolve(blob);
    }, "image/jpeg", quality);
  });
}

export async function frameToFile(frame: HTMLCanvasElement): Promise<File> {
  let blob = await jpegBlob(frame, 0.9);
  // Leave room for Base64 in the 8 MiB callable input on high-detail photos.
  if (blob.size > 5 * 1024 * 1024) blob = await jpegBlob(drawFrame(frame, frame.width, frame.height, 1800), 0.82);
  return new File([blob], "제품-스캔.jpg", { type: "image/jpeg" });
}
