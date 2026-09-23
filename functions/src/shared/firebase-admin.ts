import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

export function getAdminApp() {
  return getApps()[0] ?? initializeApp();
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminFirestore() {
  return getFirestore(getAdminApp());
}

export function getAdminPhotoBucket() {
  const projectId = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? "demo-onnuriway";
  let configuredBucket: string | undefined;
  try {
    configuredBucket = process.env.FIREBASE_CONFIG
      ? (JSON.parse(process.env.FIREBASE_CONFIG) as { storageBucket?: string }).storageBucket
      : undefined;
  } catch {
    configuredBucket = undefined;
  }
  return getStorage(getAdminApp()).bucket(configuredBucket ?? `${projectId}.appspot.com`);
}

export class DeliveryPhotoBucketConfigurationError extends Error {}

export function getAdminDeliveryPhotoBucket() {
  const bucketName = process.env.DELIVERY_PHOTO_BUCKET?.trim();
  if (!bucketName) throw new DeliveryPhotoBucketConfigurationError("DELIVERY_PHOTO_BUCKET is required for delivery photo operations.");
  if (!/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/i.test(bucketName) || bucketName.startsWith("gs://")) {
    throw new DeliveryPhotoBucketConfigurationError("DELIVERY_PHOTO_BUCKET is invalid.");
  }
  let defaultBucket: string | undefined;
  try {
    defaultBucket = process.env.FIREBASE_CONFIG
      ? (JSON.parse(process.env.FIREBASE_CONFIG) as { storageBucket?: string }).storageBucket?.trim()
      : undefined;
  } catch {
    throw new DeliveryPhotoBucketConfigurationError("FIREBASE_CONFIG is invalid.");
  }
  const projectId = (process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT)?.trim();
  const defaultBuckets = new Set([
    defaultBucket,
    ...(projectId ? [`${projectId}.appspot.com`, `${projectId}.firebasestorage.app`] : []),
  ].filter((value): value is string => Boolean(value)).map((value) => value.toLowerCase()));
  if (defaultBuckets.has(bucketName.toLowerCase())) {
    throw new DeliveryPhotoBucketConfigurationError("DELIVERY_PHOTO_BUCKET must not use the default application bucket.");
  }
  return getStorage(getAdminApp()).bucket(bucketName);
}
