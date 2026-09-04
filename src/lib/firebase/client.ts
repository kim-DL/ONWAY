import "client-only";

import { FirebaseError, getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  getToken,
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from "firebase/app-check";
import {
  connectAuthEmulator,
  getAuth,
  type Auth,
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  type Firestore,
} from "firebase/firestore";
import {
  connectFunctionsEmulator,
  getFunctions,
  type Functions,
} from "firebase/functions";
import { getFirebasePublicConfig } from "./config";

export interface FirebaseClientServices {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
  functions: Functions;
}

const emulatorMarker = Symbol.for("onnuriway.firebase-emulators-connected");
let services: FirebaseClientServices | null | undefined;
let appCheck: AppCheck | undefined;

export function getFirebaseClientServices(): FirebaseClientServices | null {
  if (services !== undefined) {
    return services;
  }

  const config = getFirebasePublicConfig();

  if (!config) {
    services = null;
    return services;
  }

  const usesEmulators = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";
  const appCheckSiteKey = process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY;
  if (!usesEmulators && !appCheckSiteKey) {
    services = null;
    return services;
  }

  const appAlreadyExists = getApps().length > 0;
  const app = appAlreadyExists ? getApp() : initializeApp(config);
  if (
    !usesEmulators &&
    appCheckSiteKey
  ) {
    // The SDK reuses the instance for identical options, including after HMR.
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }
  const firestore = appAlreadyExists
    ? getFirestore(app)
    : initializeFirestore(app, { localCache: memoryLocalCache() });

  services = {
    app,
    auth: getAuth(app),
    firestore,
    functions: getFunctions(app, "asia-northeast3"),
  };

  connectLocalEmulators(services);
  return services;
}

/** Validate this app before sending a PIN; never expose or persist its token ourselves. */
export async function ensureFirebaseAppCheckReady(): Promise<void> {
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true") return;
  if (!getFirebaseClientServices() || !appCheck) {
    throw new FirebaseError("appCheck/unconfigured", "App verification is unavailable.");
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      // Reuse the SDK cache/in-flight request instead of forcing a new assessment.
      getToken(appCheck, false),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new FirebaseError(
          "appCheck/deadline-exceeded", "App verification timed out.",
        )), 12_000);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function connectLocalEmulators(firebase: FirebaseClientServices): void {
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS !== "true") {
    return;
  }

  const markerHost = globalThis as typeof globalThis & Record<symbol, boolean>;

  if (markerHost[emulatorMarker]) {
    return;
  }

  connectAuthEmulator(firebase.auth, "http://127.0.0.1:9099", {
    disableWarnings: true,
  });
  connectFirestoreEmulator(firebase.firestore, "127.0.0.1", 8080);
  connectFunctionsEmulator(firebase.functions, "127.0.0.1", 5001);
  markerHost[emulatorMarker] = true;
}
