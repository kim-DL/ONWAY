import { z } from "zod";

const documentIdSchema = z.string().trim().min(1).max(256).regex(/^[^/]+$/u);
const requestIdSchema = z.string().uuid();

export const previewNeisSchoolSyncInputSchema = z.object({
  requestId: requestIdSchema,
}).strict();

export const applyNeisSchoolSyncInputSchema = z.object({
  runId: documentIdSchema,
  requestId: requestIdSchema,
  confirmRiskyChanges: z.boolean(),
  approvedChangeIds: z.array(documentIdSchema).min(1).max(1_000).refine(
    (values) => new Set(values).size === values.length,
    "Approved changes must be unique.",
  ).optional(),
}).strict();

export const matchSchoolWithKakaoInputSchema = z.object({
  schoolId: documentIdSchema,
  requestId: requestIdSchema,
}).strict();

const manualLocationSchema = z.object({
  latitude: z.number().min(36.0).max(36.7),
  longitude: z.number().min(127.1).max(127.7),
  name: z.string().trim().min(1).max(200),
  roadAddress: z.string().trim().min(1).max(300),
}).strict();

export const confirmKakaoMatchInputSchema = z.object({
  schoolId: documentIdSchema,
  requestId: requestIdSchema,
  expectedSchoolBaseRevision: z.number().int().positive(),
  candidateId: documentIdSchema.nullable(),
  manualLocation: manualLocationSchema.nullable(),
}).strict().superRefine((input, context) => {
  if ((input.candidateId === null) === (input.manualLocation === null)) {
    context.addIssue({
      code: "custom",
      message: "Choose exactly one stored candidate or a manual location.",
      path: ["candidateId"],
    });
  }
});

export type PreviewNeisSchoolSyncInput = z.infer<typeof previewNeisSchoolSyncInputSchema>;
export type ApplyNeisSchoolSyncInput = z.infer<typeof applyNeisSchoolSyncInputSchema>;
export type MatchSchoolWithKakaoInput = z.infer<typeof matchSchoolWithKakaoInputSchema>;
export type ConfirmKakaoMatchInput = z.infer<typeof confirmKakaoMatchInputSchema>;
