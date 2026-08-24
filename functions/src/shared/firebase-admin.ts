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
