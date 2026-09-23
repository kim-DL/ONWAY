# Delivery photo production provisioning gate

Phase 2A implements attempt-specific immutable objects but does not provision or change a production resource. Enabling the delivery-photo feature in production is blocked until the next phase verifies all of these conditions on the actual target bucket:

1. `DELIVERY_PHOTO_BUCKET` names the dedicated delivery-photo bucket in the intended `asia-northeast3` region. Verify the actual bucket location; the default application bucket is not a fallback.
2. Every service-generated upload path is under the managed `delivery-photos/` prefix and has the shape `delivery-photos/{deliveryDateKey}/{photoId}/attempts/{uploadAttemptToken}/{evidence|thumbnail}.webp`. Unit tests cover the path predicate and reject an upload outside its own attempt path.
3. The bucket does not allow public access. Verify that Public Access Prevention is **enforced** and confirm the Uniform bucket-level access setting on the actual bucket.
4. An Object Lifecycle **Delete** rule covers every managed attempt path under `delivery-photos/` at age **8 days**. Inspect the deployed rule's action, age, and prefix applicability; a planned rule is insufficient.
5. Soft Delete is **OFF** and Object Versioning is **OFF**. Verify that no retention policy, default event-based hold, or other hold prevents lifecycle or application deletion.
6. Verify effective IAM on the dedicated bucket: the delivery-photo runtime identity has only the object permissions it needs on that bucket, has no unnecessary access to existing business buckets, and does not depend on broad project-level Storage Admin permissions.
7. Keep the production delivery-photo feature disabled until the bucket and effective IAM checks above, plus the existing application, Rules, emulator, and build gates, have passed.

## Dedicated runtime identity

- Primary service account candidate: ID `delivery-photo-runtime`, email `delivery-photo-runtime@onnuriway.iam.gserviceaccount.com`. Do not create it during code preparation.
- Supply its full email through the server-only `DELIVERY_PHOTO_SERVICE_ACCOUNT` project-specific Functions environment configuration. The nine delivery-photo exports alone use it: `getDeliveryPhotoRoute`, `saveDeliveryPhotoRoute`, `getDeliveryPhotoDay`, `saveDeliveryPhotoDay`, `createDeliveryPhoto`, `listDeliveryPhotos`, `getDeliveryPhoto`, `deleteDeliveryPhoto`, and `expireDeliveryPhotos`. Do not change the existing Functions' runtime identity or global options.
- A non-emulator Functions discovery/runtime import fails if the setting is absent, malformed, points outside the target project, or names a recognized default identity. The local Functions emulator omits the service-account option and does not require a production account. The deployment manifest must be checked before deployment, and the actual deployed identities must be checked afterward.
- **Production deployment blocker:** Do not deploy any delivery-photo Function until the account exists and its effective IAM has been verified. It must have the necessary access to the dedicated bucket, no broad inherited Storage role, and no access to the existing default business bucket. Verify both bucket and project policies, including inherited grants; a bucket-local policy alone is insufficient.

## Runtime permissions to verify

- **Required by current code:** On the dedicated bucket, object create, get (including metadata and download), and delete. The Storage adapter does not list objects or update existing objects. In Firestore, the server SDK reads documents and queries and performs transactional create/update/delete for route, day, photo, request receipt/lock, rate-limit, customer/employee authorization, and audit records.
- **Probably required:** Firestore application data permissions equivalent to `roles/datastore.user`; scope and effective grants must be reviewed against the new account. Bucket-scoped `roles/storage.objectUser` is a possible starting role but includes permissions beyond the three object operations; choose between it and a narrower custom role only during provisioning command review.
- **Not required by the delivery-photo runtime code:** Storage bucket administration, object list/update, Firebase Auth user administration, Scheduler administration, or project-level Storage Admin/Editor. Deployment operator permissions and Scheduler invocation identity are separate from the Function runtime identity.
- **Requires isolated/live verification before enablement:** Callable Auth/App Check verification, scheduled invocation, Cloud Logging visibility, Firestore transactions, GCS generation preconditions, and effective IAM on both the new and existing buckets under the dedicated account. Do not assume emulator IAM behavior proves production IAM.

Application cleanup deletes normal expired photos and known orphan targets promptly. The two-hour `recoveryUntil` is an active rescan period, not proof that a pending upload cannot finish later. Immutable attempt paths keep such an upload separate from the winning photo. The dedicated bucket lifecycle is the final bound for an unknown late orphan after the worker and receipt recovery have ended. Unit tests prove path containment and data isolation; they do not simulate or claim that GCS lifecycle has been provisioned.
