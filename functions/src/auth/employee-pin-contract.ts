import { z } from "zod";

const pinSchema = z.string().regex(/^\d{6}$/u);

export const changeEmployeePinInputSchema = z.object({
  currentPin: pinSchema,
  newPin: pinSchema,
  requestId: z.string().uuid(),
  appVersion: z.string().trim().min(1).max(200),
}).strict();

export type ChangeEmployeePinInput = z.infer<typeof changeEmployeePinInputSchema>;
export type ChangeEmployeePinResult = { changed: true; pinVersion: number };
