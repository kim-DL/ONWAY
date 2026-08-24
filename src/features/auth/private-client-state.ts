import { clearSearchClientState } from "@/features/search/search-catalog-cache";
import { clearSalesWorkspaceClientState } from "@/features/sales-cycle/sales-workspace-cache";
import { clearSchoolDetailClientState } from "@/features/school-detail/school-detail-cache";
import { clearSchoolPhotoClientState } from "@/features/school-detail/school-photo-cache";

const PRIVATE_STORAGE_PREFIX = "onnuriway:private:";
const blobUrls = new Set<string>();

export function registerPrivateBlobUrl(url: string) {
  blobUrls.add(url);
  return url;
}

export function forgetPrivateBlobUrl(url: string) {
  try {
    URL.revokeObjectURL(url);
  } catch {
    // Revocation is best effort; forgetting the reference is mandatory.
  }
  blobUrls.delete(url);
}

export async function clearPrivateClientState() {
  for (const url of blobUrls) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Continue clearing the remaining private state.
    }
  }
  blobUrls.clear();

  for (const getStorage of [() => localStorage, () => sessionStorage]) {
    try {
      const storage = getStorage();
      const keys = Array.from(
        { length: storage.length },
        (_, index) => storage.key(index),
      );
      for (const key of keys) {
        if (key?.startsWith(PRIVATE_STORAGE_PREFIX)) {
          storage.removeItem(key);
        }
      }
    } catch {
      // Storage can be unavailable in hardened/private browser modes.
    }
  }

  await Promise.all([
    clearSearchClientState().catch(() => undefined),
    clearSalesWorkspaceClientState().catch(() => undefined),
    clearSchoolDetailClientState().catch(() => undefined),
    clearSchoolPhotoClientState().catch(() => undefined),
  ]);
}
