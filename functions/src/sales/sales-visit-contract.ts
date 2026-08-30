import { z } from "zod";

const documentIdSchema = z.string().trim().min(1).max(128).refine(
  (value) => !value.includes("/"),
  "Document IDs cannot contain '/'.",
);
const cycleIdSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const dateOnlySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Date must be a real calendar day.");
const interestScoreSchema = z.union([
  z.literal(0),
  z.literal(20),
  z.literal(40),
  z.literal(60),
  z.literal(80),
  z.literal(100),
]);
const deliveryStatusSchema = z.enum(["delivered", "notDelivered"]);

const legacyVisitSampleItemInputSchema = z.object({
  productId: documentIdSchema,
  quantity: z.number().int().min(1).max(999),
}).strict();

const namedVisitSampleItemInputSchema = z.object({
  productName: z.string().trim().min(1).max(120),
}).strict();

export const visitSampleItemInputSchema = z.union([
  namedVisitSampleItemInputSchema,
  legacyVisitSampleItemInputSchema,
]);

const visitSampleInputSchema = z.object({
  status: deliveryStatusSchema,
  items: z.array(visitSampleItemInputSchema).max(20),
}).strict().superRefine((sample, context) => {
  const itemKeys = sample.items.map((item) => "productName" in item
    ? `name:${item.productName.toLocaleLowerCase("ko-KR")}`
    : `id:${item.productId}`);
  if (new Set(itemKeys).size !== itemKeys.length) {
    context.addIssue({ code: "custom", message: "Sample products must be unique.", path: ["items"] });
  }
  if (sample.status === "delivered" && sample.items.length === 0) {
    context.addIssue({ code: "custom", message: "Delivered samples require at least one product.", path: ["items"] });
  }
  if (sample.status === "notDelivered" && sample.items.length > 0) {
    context.addIssue({ code: "custom", message: "Not-delivered samples cannot contain products.", path: ["items"] });
  }
});

const visitFollowUpInputSchema = z.object({
  required: z.boolean(),
  dueDate: dateOnlySchema.nullable(),
  summary: z.string().trim().min(2).max(300).nullable(),
}).strict().superRefine((followUp, context) => {
  if (followUp.required && (followUp.dueDate === null || followUp.summary === null)) {
    context.addIssue({ code: "custom", message: "Required follow-up needs a date and summary." });
  }
  if (!followUp.required && (followUp.dueDate !== null || followUp.summary !== null)) {
    context.addIssue({ code: "custom", message: "Optional follow-up must not retain a date or summary." });
  }
});

export const recordSalesVisitInputSchema = z.object({
  cycleId: cycleIdSchema,
  schoolId: documentIdSchema,
  expectedAssignmentRevision: z.number().int().positive(),
  visitedAt: z.string().datetime({ offset: true }),
  visitedBy: documentIdSchema,
  brochureStatus: deliveryStatusSchema,
  sample: visitSampleInputSchema,
  interestScore: interestScoreSchema,
  activityTagIds: z.array(documentIdSchema).max(20).refine(
    (values) => new Set(values).size === values.length,
    "Activity tags must be unique.",
  ),
  summary: z.string().trim().min(2).max(500),
  followUp: visitFollowUpInputSchema,
  requestId: z.string().uuid(),
  appVersion: z.string().trim().min(1).max(200),
}).strict();

export type RecordSalesVisitInput = z.infer<typeof recordSalesVisitInputSchema>;
