import { z } from "zod";

const documentIdSchema = z.string().trim().min(1).max(128).refine(
  (value) => !value.includes("/"),
  "Document IDs cannot contain '/'.",
);
const cycleIdSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const MIN_ROUTE_SCHOOLS = 2;
export const MAX_ROUTE_SCHOOLS = 20;

export const optimizeSalesRouteInputSchema = z.object({
  cycleId: cycleIdSchema,
  schoolIds: z.array(documentIdSchema).min(MIN_ROUTE_SCHOOLS).max(MAX_ROUTE_SCHOOLS).refine(
    (values) => new Set(values).size === values.length,
    "Schools must be unique.",
  ),
  startSchoolId: documentIdSchema,
}).strict().superRefine((input, context) => {
  if (!input.schoolIds.includes(input.startSchoolId)) {
    context.addIssue({
      code: "custom",
      message: "The starting school must be included in the route.",
      path: ["startSchoolId"],
    });
  }
});

export type OptimizeSalesRouteInput = z.infer<typeof optimizeSalesRouteInputSchema>;

