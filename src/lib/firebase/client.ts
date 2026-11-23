import "client-only";

import { FirebaseError } from "firebase/app";
import { connectFirestoreEmulator, getFirestore, initializeFirestore, memoryLocalCache, type Firestore } from "firebase/firestore";
import { getFirebaseAuthServices, type FirebaseAuthServices } from "./auth-client";

export { ensureFirebaseAppCheckReady } from "./auth-client";

export interface FirebaseClientServices extends FirebaseAuthServices {
  firestore: Firestore;
}

const emulatorMarker = Symbol.for("onnuriway.firebase-emulators-connected");
let services: FirebaseClientServices | null | undefined;

export function getFirebaseClientServices(): FirebaseClientServices | null {
  if (services !== undefined) return services;
  const authServices = getFirebaseAuthServices();
  if (!authServices) {
    services = null;
    return services;
  }
  let firestore: Firestore;
  try {
    firestore = initializeFirestore(authServices.app, { localCache: memoryLocalCache() });
  } catch (error) {
    // An app initialized by another entry point retains its Firestore settings.
    if (!(error instanceof FirebaseError) || error.code !== "failed-precondition") throw error;
    firestore = getFirestore(authServices.app);
  }
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true") {
    const host = globalThis as typeof globalThis & Record<symbol, boolean>;
    if (!host[emulatorMarker]) {
      connectFirestoreEmulator(firestore, "127.0.0.1", 8080);
      host[emulatorMarker] = true;
    }
  }
  services = { ...authServices, firestore };
  return services;
}
