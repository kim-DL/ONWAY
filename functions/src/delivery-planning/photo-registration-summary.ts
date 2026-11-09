import { z } from "zod";
import { photoBatchRowSchema, PHOTO_BATCH_MAX_ROWS } from "./photo-batch-contract.js";

const ids = z.array(photoBatchRowSchema.shape.rowId).max(PHOTO_BATCH_MAX_ROWS);
const registrationSchema = z.object({ addedIds: ids, existingIds: ids, complete: z.boolean() }).strict();
export type RegistrationDelta = { addedIds: string[]; existingIds: string[] };
export type PhotoRegistration = RegistrationDelta & { complete: boolean };
const unique = (values: string[]) => [...new Set(values)];

/** Classify the unique destinations against the transaction's effective day before merging. */
export function registrationDelta(before: string[], incoming: string[]): RegistrationDelta {
  const existing = new Set(before); const targets = unique(incoming);
  return { addedIds: targets.filter((id) => !existing.has(id)), existingIds: targets.filter((id) => existing.has(id)) };
}

/** Internal scan metadata lives outside the strict, backwards-compatible public result. */
export function mergePhotoRegistration(previous: unknown, savedIds: string[], delta: RegistrationDelta): PhotoRegistration {
  const parsed = registrationSchema.safeParse(previous);
  const saved = new Set(savedIds);
  const prior = parsed.success ? parsed.data : { addedIds: [], existingIds: [], complete: saved.size === 0 };
  const covered = new Set([...prior.addedIds, ...prior.existingIds]);
  const complete = prior.complete && savedIds.every((id) => covered.has(id))
    && [...covered].every((id) => saved.has(id));
  const addedIds = unique([...prior.addedIds.filter((id) => saved.has(id)), ...delta.addedIds]);
  const added = new Set(addedIds);
  return { addedIds, existingIds: unique([...prior.existingIds.filter((id) => saved.has(id)), ...delta.existingIds]).filter((id) => !added.has(id)), complete };
}

export function photoRegistrationMessage(registration: PhotoRegistration): string {
  return registration.complete && registration.addedIds.length + registration.existingIds.length
    ? `새로 추가 ${registration.addedIds.length}곳 · 이미 등록 ${registration.existingIds.length}곳` : "";
}
