import { z } from "zod";

export const salesRouteMetricSchema = z.object({
  fromSchoolId: z.string().min(1).max(128),
  toSchoolId: z.string().min(1).max(128),
  distanceMeters: z.number().int().nonnegative(),
  durationSeconds: z.number().int().nonnegative(),
  source: z.enum(["road", "distanceEstimate"]),
}).strict();

export const salesRouteStopSchema = z.object({
  schoolId: z.string().min(1).max(128),
  name: z.string().min(1).max(200),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  position: z.number().int().positive().max(20),
  fromPrevious: salesRouteMetricSchema.nullable(),
}).strict();

export const salesRouteResultSchema = z.object({
  cycleId: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  calculationMode: z.enum(["road", "hybrid", "distanceEstimate"]),
  orderedSchoolIds: z.array(z.string().min(1).max(128)).min(2).max(20),
  stops: z.array(salesRouteStopSchema).min(2).max(20),
  metrics: z.array(salesRouteMetricSchema).max(400),
  totalDistanceMeters: z.number().int().nonnegative(),
  totalDurationSeconds: z.number().int().nonnegative(),
  warning: z.string().nullable(),
}).strict();

export const activeSalesRouteSchema = z.object({
  result: salesRouteResultSchema,
  orderedSchoolIds: z.array(z.string().min(1).max(128)).min(2).max(20),
  manuallyAdjusted: z.boolean(),
  savedAt: z.number().int().nonnegative(),
}).strict();

export type SalesRouteMetric = z.infer<typeof salesRouteMetricSchema>;
export type SalesRouteResult = z.infer<typeof salesRouteResultSchema>;
export type ActiveSalesRoute = z.infer<typeof activeSalesRouteSchema>;

