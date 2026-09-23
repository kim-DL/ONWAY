# Delivery photo production provisioning gate

Phase 2A implements attempt-specific immutable objects but does not provision or change a production resource. Enabling the delivery-photo feature in production is blocked until the next phase verifies all of these conditions on the actual target bucket:

1. `DELIVERY_PHOTO_BUCKET` names the dedicated delivery-photo bucket in the intended `asia-northeast3` region. Verify the actual bucket location; the default application bucket is not a fallback.
2. Every service-generated upload path is under the managed `delivery-photos/` prefix and has the shape `delivery-photos/{deliveryDateKey}/{photoId}/attempts/{uploadAttemptToken}/{evidence|thumbnail}.webp`. Unit tests cover the path predicate and reject an upload outside its own attempt path.
3. The bucket does not allow public access. Verify that Public Access Prevention is **enforced** and confirm the Uniform bucket-level access setting on the actual bucket.
4. An Object Lifecycle **Delete** rule covers every managed attempt path under `delivery-photos/` at age **8 days**. Inspect the deployed rule's action, age, and prefix applicability; a planned rule is insufficient.
5. Soft Delete is **OFF** and Object Versioning is **OFF**. Verify that no retention policy, default event-based hold, or other hold prevents lifecycle or application deletion.
6. Verify effective IAM on the dedicated bucket: the delivery-photo runtime identity has only the object permissions it needs on that bucket, has no unnecessary access to existing business buckets, and does not depend on broad project-level Storage Admin permissions.
7. Keep the production delivery-photo feature disabled until the bucket and effective IAM checks above, plus the existing application, Rules, emulator, and build gates, have passed.

Application cleanup deletes normal expired photos and known orphan targets promptly. The two-hour `recoveryUntil` is an active rescan period, not proof that a pending upload cannot finish later. Immutable attempt paths keep such an upload separate from the winning photo. The dedicated bucket lifecycle is the final bound for an unknown late orphan after the worker and receipt recovery have ended. Unit tests prove path containment and data isolation; they do not simulate or claim that GCS lifecycle has been provisioned.
