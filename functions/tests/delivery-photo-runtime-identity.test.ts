import { afterEach, describe, expect, it, vi } from "vitest";

import { deliveryPhotoServiceAccountOption } from "../src/delivery-photo/delivery-photo-runtime-identity.js";

const projectId = "demo-onnuriway";
const account = `delivery-photo-runtime@${projectId}.iam.gserviceaccount.com`;
const deliveryPhotoFunctionNames = [
  "createDeliveryPhoto", "deleteDeliveryPhoto", "expireDeliveryPhotos", "getDeliveryPhoto",
  "getDeliveryPhotoDay", "getDeliveryPhotoRoute", "listDeliveryPhotos", "saveDeliveryPhotoDay", "saveDeliveryPhotoRoute",
];

function endpoint(value: unknown) {
  return (value as { __endpoint: { serviceAccountEmail?: string; callableTrigger?: object; scheduleTrigger?: object } }).__endpoint;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("delivery-photo dedicated runtime identity", () => {
  it("accepts only a custom service account in the target project", () => {
    expect(deliveryPhotoServiceAccountOption({ GCLOUD_PROJECT: projectId, DELIVERY_PHOTO_SERVICE_ACCOUNT: account }))
      .toEqual({ serviceAccount: account });
    for (const invalid of [
      undefined, "", "default", "delivery-photo-runtime@other-project.iam.gserviceaccount.com",
      "123456789012-compute@developer.gserviceaccount.com", `${projectId}@appspot.gserviceaccount.com`,
      `firebase-adminsdk-test@${projectId}.iam.gserviceaccount.com`,
      `short@${projectId}.iam.gserviceaccount.com`, `DELIVERY-photo@${projectId}.iam.gserviceaccount.com`,
      ` ${account}`,
    ]) {
      expect(() => deliveryPhotoServiceAccountOption({ GCLOUD_PROJECT: projectId, DELIVERY_PHOTO_SERVICE_ACCOUNT: invalid }))
        .toThrow("DELIVERY_PHOTO_SERVICE_ACCOUNT");
    }
    expect(() => deliveryPhotoServiceAccountOption({ DELIVERY_PHOTO_SERVICE_ACCOUNT: account }))
      .toThrow("DELIVERY_PHOTO_SERVICE_ACCOUNT");
    expect(() => deliveryPhotoServiceAccountOption({ GCLOUD_PROJECT: projectId, GOOGLE_CLOUD_PROJECT: "other-project", DELIVERY_PHOTO_SERVICE_ACCOUNT: account }))
      .toThrow("DELIVERY_PHOTO_SERVICE_ACCOUNT");
  });

  it("does not require or attach a production identity in the local emulator", async () => {
    expect(deliveryPhotoServiceAccountOption({ FUNCTIONS_EMULATOR: "true" })).toEqual({});
    vi.stubEnv("FUNCTIONS_EMULATOR", "true");
    vi.stubEnv("DELIVERY_PHOTO_SERVICE_ACCOUNT", "");
    const exports = await import("../src/delivery-photo/delivery-photo-callables.js");
    for (const name of deliveryPhotoFunctionNames) {
      expect(endpoint(exports[name as keyof typeof exports]).serviceAccountEmail).not.toBe(account);
    }
  });

  it("fails module discovery when non-emulator configuration is missing", async () => {
    vi.stubEnv("FUNCTIONS_EMULATOR", "false");
    vi.stubEnv("GCLOUD_PROJECT", projectId);
    vi.stubEnv("DELIVERY_PHOTO_SERVICE_ACCOUNT", "");
    await expect(import("../src/delivery-photo/delivery-photo-callables.js"))
      .rejects.toThrow("DELIVERY_PHOTO_SERVICE_ACCOUNT");
  });

  it("puts the dedicated identity on exactly the nine exported deployment specs", async () => {
    vi.stubEnv("FUNCTIONS_EMULATOR", "false");
    vi.stubEnv("GCLOUD_PROJECT", projectId);
    vi.stubEnv("GOOGLE_CLOUD_PROJECT", projectId);
    vi.stubEnv("DELIVERY_PHOTO_SERVICE_ACCOUNT", account);
    const exports = await import("../src/index.js");
    const configured = Object.entries(exports).filter(([, value]) => value && typeof value === "function"
      && "__endpoint" in value && typeof endpoint(value).serviceAccountEmail === "string").map(([name]) => name).sort();
    expect(configured).toEqual(deliveryPhotoFunctionNames.toSorted());
    for (const name of deliveryPhotoFunctionNames) {
      expect(endpoint(exports[name as keyof typeof exports]).serviceAccountEmail).toBe(account);
    }
    expect(endpoint(exports.expireDeliveryPhotos).scheduleTrigger).toBeDefined();
    expect(endpoint(exports.createDeliveryPhoto).callableTrigger).toBeDefined();
    expect(endpoint(exports.uploadCustomerPhoto).serviceAccountEmail).not.toBe(account);
  });
});
