import { z } from "zod";

// Mirrors backend/src/routes/messageTemplates.ts's createSchema (see
// [[lead]] schema for why this is hand-duplicated rather than shared).
export const CHANNELS = ["email", "whatsapp"] as const;
export const CATEGORIES = ["proposal_followup", "payment_reminder", "checkin"] as const;

export const messageTemplateFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  channel: z.enum(CHANNELS),
  subject: z.string().optional().or(z.literal("")),
  body: z.string().min(1, "Body is required"),
  category: z.enum(CATEGORIES),
});

export type MessageTemplateFormValues = z.infer<typeof messageTemplateFormSchema>;

export const emptyMessageTemplateForm: MessageTemplateFormValues = {
  name: "", channel: "email", subject: "", body: "", category: "proposal_followup",
};
