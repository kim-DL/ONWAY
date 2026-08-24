import { z } from "zod";

import { INTEREST_SCORES } from "@/domain/sales";

const documentIdSchema = z.string().trim().min(1).max(128).refine((value) => !value.includes("/"));
const dateOnlySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
const deliveryStatusSchema = z.enum(["delivered", "notDelivered"]);
const interestScoreSchema = z.union(INTEREST_SCORES.map((score) => z.literal(score)));

export const recordSalesVisitInputSchema = z.object({
  cycleId: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  schoolId: documentIdSchema,
  expectedAssignmentRevision: z.number().int().positive(),
  visitedAt: z.string().datetime({ offset: true }),
  visitedBy: documentIdSchema,
  brochureStatus: deliveryStatusSchema,
  sample: z.object({
    status: deliveryStatusSchema,
    items: z.array(z.object({
      productId: documentIdSchema,
      quantity: z.number().int().min(1).max(999),
    }).strict()).max(20),
  }).strict(),
  interestScore: interestScoreSchema,
  activityTagIds: z.array(documentIdSchema).max(20),
  summary: z.string().trim().min(2).max(500),
  followUp: z.object({
    required: z.boolean(),
    dueDate: dateOnlySchema.nullable(),
    summary: z.string().trim().min(2).max(300).nullable(),
  }).strict(),
  requestId: z.string().uuid(),
  appVersion: z.string().trim().min(1).max(200),
}).strict().superRefine((input, context) => {
  const productIds = input.sample.items.map((item) => item.productId);
  if (new Set(productIds).size !== productIds.length) {
    context.addIssue({ code: "custom", message: "샘플 제품은 중복 선택할 수 없습니다.", path: ["sample", "items"] });
  }
  if (input.sample.status === "delivered" && input.sample.items.length === 0) {
    context.addIssue({ code: "custom", message: "전달한 샘플 제품을 선택해주세요.", path: ["sample", "items"] });
  }
  if (input.sample.status === "notDelivered" && input.sample.items.length > 0) {
    context.addIssue({ code: "custom", message: "미전달 샘플에는 제품을 남길 수 없습니다.", path: ["sample", "items"] });
  }
  if (new Set(input.activityTagIds).size !== input.activityTagIds.length) {
    context.addIssue({ code: "custom", message: "활동 태그는 중복 선택할 수 없습니다.", path: ["activityTagIds"] });
  }
  if (input.followUp.required && (input.followUp.dueDate === null || input.followUp.summary === null)) {
    context.addIssue({ code: "custom", message: "후속 날짜와 내용을 입력해주세요.", path: ["followUp"] });
  }
  if (!input.followUp.required && (input.followUp.dueDate !== null || input.followUp.summary !== null)) {
    context.addIssue({ code: "custom", message: "후속이 없으면 날짜와 내용을 비워주세요.", path: ["followUp"] });
  }
});

export const recordSalesVisitResultSchema = z.object({
  visitId: documentIdSchema,
  assignmentRevision: z.number().int().positive(),
  salesRevision: z.number().int().positive(),
  monthlyStatus: z.enum(["completed", "followUp"]),
  visitedAt: z.string().datetime(),
  replayed: z.boolean(),
}).strict();

export type RecordSalesVisitInput = z.infer<typeof recordSalesVisitInputSchema>;
export type RecordSalesVisitResult = z.infer<typeof recordSalesVisitResultSchema>;

export function todayInSeoul(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function visitTimestampFromDate(dateOnly: string, now = new Date()) {
  return dateOnly === todayInSeoul(now) ? now.toISOString() : new Date(`${dateOnly}T12:00:00+09:00`).toISOString();
}
