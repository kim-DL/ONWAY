export const DELIVERY_PHOTO_SERVICE_ACCOUNT_ENV = "DELIVERY_PHOTO_SERVICE_ACCOUNT";

type RuntimeIdentityEnvironment = {
  FUNCTIONS_EMULATOR?: string;
  GCLOUD_PROJECT?: string;
  GOOGLE_CLOUD_PROJECT?: string;
  DELIVERY_PHOTO_SERVICE_ACCOUNT?: string;
};

const serviceAccountEmail = /^([a-z][a-z0-9-]{4,28}[a-z0-9])@([a-z][a-z0-9-]{4,28}[a-z0-9])\.iam\.gserviceaccount\.com$/;

export function deliveryPhotoServiceAccountOption(environment: RuntimeIdentityEnvironment = process.env) {
  if (environment.FUNCTIONS_EMULATOR === "true") return {};

  const projectId = environment.GCLOUD_PROJECT ?? environment.GOOGLE_CLOUD_PROJECT;
  const configured = environment.DELIVERY_PHOTO_SERVICE_ACCOUNT;
  const match = configured?.match(serviceAccountEmail);
  if (!projectId || (environment.GCLOUD_PROJECT && environment.GOOGLE_CLOUD_PROJECT
      && environment.GCLOUD_PROJECT !== environment.GOOGLE_CLOUD_PROJECT)
    || !configured || !match || match[2] !== projectId || match[1]?.startsWith("firebase-adminsdk-")) {
    throw new Error(`${DELIVERY_PHOTO_SERVICE_ACCOUNT_ENV} must name a dedicated service account in the target project.`);
  }
  return { serviceAccount: configured };
}
