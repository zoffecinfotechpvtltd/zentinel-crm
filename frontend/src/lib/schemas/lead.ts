import { z } from "zod";

// Mirrors backend/src/routes/leads.ts's createLeadSchema/updateLeadSchema
// field-for-field. Not literally imported from the backend - this repo has
// no monorepo/workspace setup (backend and frontend are two independent
// npm packages with separate deploys on Render/Vercel), so a real shared
// package is a bigger infra change than this form fix warrants. Keep this
// in sync by hand if the backend schema changes.
//
// The actual point of duplicating it here: React Hook Form only calls the
// submit handler after this schema passes, which structurally removes the
// premature "Saving…" state the audit flagged - and every message below
// is a real sentence, never a raw Zod string like "String must contain at
// least 1 character(s)" reaching the UI.
export const INDUSTRIES = ["Banking & Finance", "IT/Software", "Healthcare", "Government", "Manufacturing", "E-commerce", "Telecom", "Other"] as const;
export const SOURCES = ["Website", "Referral", "LinkedIn", "Cold Call", "Event", "Email Campaign"] as const;

const optionalText = z.string().optional().or(z.literal(""));

export const leadFormSchema = z.object({
  company: z.string().min(1, "Company name is required"),
  contact_person: z.string().min(1, "Contact person is required"),
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  designation: optionalText,
  mobile: optionalText,
  industry: z.union([z.enum(INDUSTRIES), z.literal("")]).optional(),
  source: z.union([z.enum(SOURCES), z.literal("")]).optional(),
  service_id: optionalText,
  value_estimate: z.union([
    z.string().refine((v) => v === "" || (!Number.isNaN(Number(v)) && Number(v) >= 0), "Value estimate must be a positive number"),
  ]).optional(),
  next_followup_date: optionalText,
  notes: optionalText,
});

export type LeadFormValues = z.infer<typeof leadFormSchema>;

export const emptyLeadForm: LeadFormValues = {
  company: "", contact_person: "", designation: "", email: "", mobile: "",
  industry: "", source: "", service_id: "", value_estimate: "", next_followup_date: "", notes: "",
};
