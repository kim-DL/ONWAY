import { Timestamp, type DocumentData } from "firebase-admin/firestore";

import { getAdminDeliveryPhotoBucket } from "../shared/firebase-admin.js";
import {
  deliveryPhotoSchema, type DeliveryPhoto, type DeliveryPhotoMetadata, type DeliveryPhotoObject,
} from "./delivery-photo-contract.js";

export const DELIVERY_PHOTO_ROUTE_PATH = "companies/onnuri/deliveryPhotoRoutes";
export const DELIVERY_PHOTO_DAY_PATH = "companies/onnuri/deliveryPhotoDays";
export const DELIVERY_PHOTO_PATH = "companies/onnuri/deliveryPhotos";

export type DeliveryPhotoVariant = "evidence" | "thumbnail";
export type InspectedDeliveryPhotoObject = Pick<DeliveryPhotoObject, "objectPath" | "generation"> & {
  uploadAttemptToken?: string;
};
export type OwnedDeliveryPhotoObject = DeliveryPhotoObject;
export class DeliveryPhotoUploadOwnershipError extends Error {}
export type StoredDeliveryPhoto = Omit<DeliveryPhoto, "createdAt" | "expiresAt" | "deletion" | "cleanupAfter"> & {
  createdAt: Timestamp;
  expiresAt: Timestamp;
  cleanupAfter?: Timestamp | null;
  deletion?: {
    deletedAt: Timestamp;
    deletedByEmployeeId: string;
    deleteReason: "user" | "admin" | "expired";
  };
};

export const DELIVERY_PHOTO_MANAGED_PREFIX = "delivery-photos/";

export function deliveryPhotoPath(deliveryDateKey: string, photoId: string, uploadAttemptToken: string, variant: DeliveryPhotoVariant) {
  return `${DELIVERY_PHOTO_MANAGED_PREFIX}${deliveryDateKey}/${photoId}/attempts/${uploadAttemptToken}/${variant}.webp`;
}

export function isDeliveryPhotoManagedPath(path: string) {
  return /^delivery-photos\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\/attempts\/[0-9a-f-]{36}\/(?:evidence|thumbnail)\.webp$/.test(path);
}

export function deliveryPhotoFromDocument(data: DocumentData): StoredDeliveryPhoto {
  const parsed = deliveryPhotoSchema.parse({
    ...data,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
    expiresAt: data.expiresAt instanceof Timestamp ? data.expiresAt.toDate().toISOString() : data.expiresAt,
    cleanupAfter: data.cleanupAfter instanceof Timestamp ? data.cleanupAfter.toDate().toISOString() : data.cleanupAfter,
    ...(data.deletion ? {
      deletion: {
        ...data.deletion,
        deletedAt: data.deletion.deletedAt instanceof Timestamp ? data.deletion.deletedAt.toDate().toISOString() : data.deletion.deletedAt,
      },
    } : {}),
  });
  const { createdAt, expiresAt, cleanupAfter, deletion, ...rest } = parsed;
  const stored: StoredDeliveryPhoto = {
    ...rest,
    createdAt: Timestamp.fromDate(new Date(parsed.createdAt)),
    expiresAt: Timestamp.fromDate(new Date(parsed.expiresAt)),
  };
  if (cleanupAfter !== undefined) {
    stored.cleanupAfter = cleanupAfter === null ? null : Timestamp.fromDate(new Date(cleanupAfter));
  }
  if (deletion) stored.deletion = { ...deletion, deletedAt: Timestamp.fromDate(new Date(deletion.deletedAt)) };
  void createdAt;
  void expiresAt;
  return stored;
}

export function deliveryPhotoMetadata(photo: StoredDeliveryPhoto): DeliveryPhotoMetadata {
  return {
    photoId: photo.photoId,
    customerId: photo.customerId,
    deliveryDateKey: photo.deliveryDateKey,
    source: photo.source,
    createdAt: photo.createdAt.toDate().toISOString(),
    createdByEmployeeId: photo.createdByEmployeeId,
    createdByName: photo.createdByName,
    expiresAt: photo.expiresAt.toDate().toISOString(),
    thumbnail: { width: photo.thumbnail.width, height: photo.thumbnail.height },
  };
}

export interface DeliveryPhotoStorage {
  save(path: string, bytes: Buffer, dimensions: { width: number; height: number }, uploadAttemptToken: string): Promise<OwnedDeliveryPhotoObject>;
  download(object: DeliveryPhotoObject): Promise<Buffer>;
  inspect(path: string): Promise<InspectedDeliveryPhotoObject | null>;
  delete(object: Pick<DeliveryPhotoObject, "objectPath" | "generation">): Promise<void>;
}

function dependencyCode(error: unknown) {
  return error && typeof error === "object" && "code" in error ? Number(error.code) : undefined;
}

export class GoogleDeliveryPhotoStorage implements DeliveryPhotoStorage {
  constructor(private readonly bucket = getAdminDeliveryPhotoBucket()) {}

  async save(path: string, bytes: Buffer, dimensions: { width: number; height: number }, uploadAttemptToken: string): Promise<OwnedDeliveryPhotoObject> {
    if (!isDeliveryPhotoManagedPath(path) || !path.includes(`/attempts/${uploadAttemptToken}/`)) {
      throw new DeliveryPhotoUploadOwnershipError("Delivery photo upload path is outside its managed attempt.");
    }
    const file = this.bucket.file(path);
    await file.save(bytes, {
      resumable: false,
      preconditionOpts: { ifGenerationMatch: 0 },
      metadata: {
        contentType: "image/webp",
        cacheControl: "private, no-store, max-age=0",
        metadata: { deliveryPhotoUploadAttempt: uploadAttemptToken },
      },
    });
    const metadata = file.metadata;
    const generation = metadata.generation === undefined ? "" : String(metadata.generation);
    const returnedUploadAttemptToken = typeof metadata.metadata?.deliveryPhotoUploadAttempt === "string"
      ? metadata.metadata.deliveryPhotoUploadAttempt
      : undefined;
    if (!/^\d+$/.test(generation) || returnedUploadAttemptToken !== uploadAttemptToken) {
      throw new DeliveryPhotoUploadOwnershipError("Stored delivery photo upload ownership is unavailable.");
    }
    return {
      objectPath: path,
      generation,
      uploadAttemptToken,
      contentType: "image/webp",
      byteSize: bytes.length,
      width: dimensions.width,
      height: dimensions.height,
    };
  }

  async inspect(path: string) {
    try {
      const [metadata] = await this.bucket.file(path).getMetadata();
      const generation = String(metadata.generation ?? "");
      if (!/^\d+$/.test(generation)) throw new Error("Stored delivery photo generation is unavailable.");
      const uploadAttemptToken = typeof metadata.metadata?.deliveryPhotoUploadAttempt === "string"
        ? metadata.metadata.deliveryPhotoUploadAttempt
        : undefined;
      return { objectPath: path, generation, ...(uploadAttemptToken ? { uploadAttemptToken } : {}) };
    } catch (error) {
      if (dependencyCode(error) === 404) return null;
      throw error;
    }
  }

  async download(object: DeliveryPhotoObject) {
    const file = this.bucket.file(object.objectPath);
    const [before] = await file.getMetadata();
    if (String(before.generation ?? "") !== object.generation || before.contentType !== "image/webp"
      || before.metadata?.deliveryPhotoUploadAttempt !== object.uploadAttemptToken) {
      throw new Error("Delivery photo generation or content type changed.");
    }
    const [buffer] = await file.download({ start: 0, end: object.byteSize });
    const [after] = await file.getMetadata();
    if (String(after.generation ?? "") !== object.generation || after.contentType !== "image/webp"
      || after.metadata?.deliveryPhotoUploadAttempt !== object.uploadAttemptToken) {
      throw new Error("Delivery photo generation or content type changed during download.");
    }
    return buffer;
  }

  async delete(object: Pick<DeliveryPhotoObject, "objectPath" | "generation">) {
    const file = this.bucket.file(object.objectPath);
    try {
      await file.delete({ ignoreNotFound: true, ifGenerationMatch: object.generation });
    } catch (error) {
      if (dependencyCode(error) !== 404) throw error;
    }
  }

}
