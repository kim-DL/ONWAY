import { z } from "zod";
import { INVENTORY_LOCATIONS } from "./inventory-labels.js";

const employeeId = z.string().trim().min(1).max(128).regex(/^[^/]+$/u);
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const locationOwnersSchema = z.record(z.enum(INVENTORY_LOCATIONS), employeeId.nullable());
export const locationAssignmentsSchema = z.object({ revision, owners: locationOwnersSchema }).strict();
export const locationRosterSchema = locationAssignmentsSchema.extend({
  staff: z.array(z.object({ employeeId, displayName: z.string().min(1).max(100) }).strict()),
});
export const saveLocationAssignmentsSchema = z.object({ requestId: z.uuid(), expectedRevision: revision, owners: locationOwnersSchema }).strict();
export type LocationAssignments = z.infer<typeof locationAssignmentsSchema>;
export type LocationRoster = z.infer<typeof locationRosterSchema>;
export type SaveLocationAssignments = z.infer<typeof saveLocationAssignmentsSchema>;
