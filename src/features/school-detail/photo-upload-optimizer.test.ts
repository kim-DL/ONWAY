import { describe, expect, it } from "vitest";

import {
  calculateOptimizedDimensions,
  formatPhotoBytes,
  shouldOptimizeSchoolPhoto,
} from "./photo-upload-optimizer";

describe("mobile photo upload optimization", () => {
  it("keeps small photos within the target edge", () => {
    expect(calculateOptimizedDimensions({ width: 1_200, height: 900 })).toEqual({ width: 1_200, height: 900 });
  });

  it("scales landscape and portrait photos without changing their ratio", () => {
    expect(calculateOptimizedDimensions({ width: 4_032, height: 3_024 })).toEqual({ width: 2_560, height: 1_920 });
    expect(calculateOptimizedDimensions({ width: 3_024, height: 4_032 })).toEqual({ width: 1_920, height: 2_560 });
  });

  it("optimizes large, oversized, and browser-decoded source formats", () => {
    expect(shouldOptimizeSchoolPhoto({ byteSize: 2_000_000, contentType: "image/jpeg", dimensions: { width: 2_000, height: 1_500 } })).toBe(true);
    expect(shouldOptimizeSchoolPhoto({ byteSize: 900_000, contentType: "image/jpeg", dimensions: { width: 4_000, height: 3_000 } })).toBe(true);
    expect(shouldOptimizeSchoolPhoto({ byteSize: 900_000, contentType: "image/heic", dimensions: { width: 2_000, height: 1_500 } })).toBe(true);
    expect(shouldOptimizeSchoolPhoto({ byteSize: 900_000, contentType: "image/webp", dimensions: { width: 2_000, height: 1_500 } })).toBe(false);
  });

  it("formats the size reduction for the upload UI", () => {
    expect(formatPhotoBytes(842_000)).toBe("842KB");
    expect(formatPhotoBytes(2_450_000)).toBe("2.5MB");
  });
});
