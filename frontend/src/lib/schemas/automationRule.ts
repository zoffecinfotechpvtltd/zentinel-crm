import { z } from "zod";

// Mirrors backend/src/routes/automationRules.ts's createSchema (see
// [[lead]] schema for why this is hand-duplicated rather than shared).
// notify_target folds the backend's notify_role/notify_user_id pair into
// one "role:x" / "user:x" combobox value (matching AutomationRules.tsx's
// existing notifyOptions shape) and gets split back apart at submit.
export const ENTITY_TYPES = ["lead", "opportunity", "invoice", "project"] as const;

export const automationRuleFormSchema = z.object({
  name: z.string().min(1, "Rule name is required"),
  entity_type: z.enum(ENTITY_TYPES),
  trigger_status: z.string().min(1, "Pick a status to trigger on"),
  notify_target: z.string().min(1, "Pick who gets notified"),
  message_template: z.string().min(1, "Message is required"),
});

export type AutomationRuleFormValues = z.infer<typeof automationRuleFormSchema>;

export const emptyAutomationRuleForm: AutomationRuleFormValues = {
  name: "", entity_type: "lead", trigger_status: "", notify_target: "", message_template: "{company} moved to {status}",
};
