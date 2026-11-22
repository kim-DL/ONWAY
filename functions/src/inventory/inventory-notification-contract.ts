import { z } from "zod";

export const NOTICE_POLICY_PATH = "companies/onnuri/inventoryNoticePolicies";
export const NOTICE_FEED_PATH = "companies/onnuri/inventoryNotices";
export const NOTICE_ROSTER_PATH = "companies/onnuri/inventoryNoticeSettings/recipients";
export const NOTICE_WINDOW = 50;

const command = z.object({
  requestId: z.uuid(),
  expectedRevision: z.number().int().nonnegative(),
});
export const assignNoticeRecipientSchema = command.extend({
  employeeId: z.string().min(1).max(128).regex(/^[^/]+$/u),
  assigned: z.boolean(),
}).strict();
export const setNoticePreferenceSchema = command.extend({ enabled: z.boolean() }).strict();
export type NoticeCommand = z.infer<typeof assignNoticeRecipientSchema> | z.infer<typeof setNoticePreferenceSchema>;
