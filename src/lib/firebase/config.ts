export interface FirebasePublicConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

const CONFIG_KEYS = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
] as const;

type FirebasePublicConfigInput = Partial<
  Record<(typeof CONFIG_KEYS)[number], string | undefined>
>;

export function resolveFirebasePublicConfig(
  input: FirebasePublicConfigInput,
): FirebasePublicConfig | null {
  const providedKeys = CONFIG_KEYS.filter((key) => Boolean(input[key]?.trim()));

  if (providedKeys.length === 0) {
    return null;
  }

  const missingKeys = CONFIG_KEYS.filter((key) => !input[key]?.trim());

  if (missingKeys.length > 0) {
    throw new Error(`Firebase public configuration is incomplete: ${missingKeys.join(", ")}`);
  }

  return Object.fromEntries(
    CONFIG_KEYS.map((key) => [key, input[key]!.trim()]),
  ) as unknown as FirebasePublicConfig;
}

export function getFirebasePublicConfig(): FirebasePublicConfig | null {
  return resolveFirebasePublicConfig({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  });
}
