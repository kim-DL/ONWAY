import { z } from "zod";

const devicePlatformSchema = z.enum(["android", "ios", "windows", "macos", "chromeos", "other"]);

function participantSchema(prefix: "DEL" | "SAL" | "ADM") {
  return z.object({
    participantId: z.string().regex(new RegExp(`^PILOT-${prefix}-\\d{2}$`)),
    devicePlatform: devicePlatformSchema,
  }).strict();
}

export const phase18PilotPlanSchema = z.object({
  schemaVersion: z.literal(1),
  pilotId: z.string().regex(/^phase18-[a-z0-9-]{4,40}$/),
  environment: z.object({
    kind: z.literal("staging"),
    url: z.string().url().refine((value) => value.startsWith("https://"), "Staging URL must use HTTPS."),
    firebaseProjectId: z.string().min(4).max(80).refine((value) => !value.startsWith("demo-"), "Demo Firebase projects cannot host a real Pilot."),
    dataMode: z.literal("sanitized"),
  }).strict(),
  window: z.object({
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
  }).strict(),
  participants: z.object({
    delivery: z.array(participantSchema("DEL")).min(1).max(2),
    sales: z.array(participantSchema("SAL")).min(1).max(2),
    admin: z.array(participantSchema("ADM")).length(1),
  }).strict(),
  operations: z.object({
    supportOwnerParticipantId: z.string().regex(/^PILOT-ADM-\d{2}$/),
    rollbackOwnerParticipantId: z.string().regex(/^PILOT-ADM-\d{2}$/),
    incidentChannel: z.string().trim().min(3).max(100),
  }).strict(),
  approvals: z.object({
    privacyNoticeAcknowledged: z.literal(true),
    pilotOwnerApproved: z.literal(true),
  }).strict(),
  acceptanceReportPath: z.string().trim().min(1).max(240),
}).strict().superRefine((plan, context) => {
  const startsAt = Date.parse(plan.window.startsAt);
  const endsAt = Date.parse(plan.window.endsAt);
  const durationHours = (endsAt - startsAt) / 3_600_000;
  if (durationHours < 72 || durationHours > 336) {
    context.addIssue({
      code: "custom",
      path: ["window"],
      message: "Pilot window must be between 72 hours and 14 days.",
    });
  }

  const ids = [
    ...plan.participants.delivery,
    ...plan.participants.sales,
    ...plan.participants.admin,
  ].map((participant) => participant.participantId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", path: ["participants"], message: "Participant IDs must be unique." });
  }

  const adminIds = new Set(plan.participants.admin.map((participant) => participant.participantId));
  if (!adminIds.has(plan.operations.supportOwnerParticipantId)) {
    context.addIssue({ code: "custom", path: ["operations", "supportOwnerParticipantId"], message: "Support owner must be the Pilot Admin." });
  }
  if (!adminIds.has(plan.operations.rollbackOwnerParticipantId)) {
    context.addIssue({ code: "custom", path: ["operations", "rollbackOwnerParticipantId"], message: "Rollback owner must be the Pilot Admin." });
  }
});

export const phase17AcceptanceReportSchema = z.object({
  status: z.literal("passed"),
  p0Defects: z.literal(0),
  p1Defects: z.literal(0),
  generatedAt: z.string().datetime({ offset: true }),
}).passthrough();

export type Phase18PilotPlan = z.infer<typeof phase18PilotPlanSchema>;

export function assessPhase18PilotReadiness(input: {
  plan: unknown;
  acceptanceReport: unknown;
}) {
  const issues: string[] = [];
  const planResult = phase18PilotPlanSchema.safeParse(input.plan);
  const acceptanceResult = phase17AcceptanceReportSchema.safeParse(input.acceptanceReport);

  if (!planResult.success) {
    issues.push(...planResult.error.issues.map((issue) => `${issue.path.join(".") || "plan"}: ${issue.message}`));
  }
  if (!acceptanceResult.success) {
    issues.push(...acceptanceResult.error.issues.map((issue) => `acceptance.${issue.path.join(".") || "report"}: ${issue.message}`));
  }

  if (planResult.success && acceptanceResult.success) {
    const startsAt = Date.parse(planResult.data.window.startsAt);
    const acceptedAt = Date.parse(acceptanceResult.data.generatedAt);
    const ageHours = (startsAt - acceptedAt) / 3_600_000;
    if (ageHours < 0 || ageHours > 168) {
      issues.push("acceptance.generatedAt: Phase 17 acceptance must pass within 7 days before the Pilot starts.");
    }
  }

  return { ready: issues.length === 0, issues } as const;
}
