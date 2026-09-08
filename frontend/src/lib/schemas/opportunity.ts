import { z } from "zod";

// Mirrors backend/src/routes/opportunities.ts's createSchema/updateSchema
// field-for-field (see [[lead]] schema for why this is hand-duplicated
// rather than shared). client_id/lead_id/custom_fields stay outside this
// schema and this form's RHF state entirely - they're derived/ancillary
// (the company-search linkage, the dynamic custom-fields payload), not
// something a user types into a validated field, so they're tracked as
// plain component state and merged into the payload at submit, exactly
// like Leads.tsx already does for custom_fields.
export const KINDS = ["service", "product"] as const;
export const STAGES = ["Open", "Proposal Sent", "Won", "Lost"] as const;

const optionalText = z.string().optional().or(z.literal(""));

export const opportunityFormSchema = z
  .object({
    kind: z.enum(KINDS),
    company: z.string().min(1, "Company is required"),
    client_name: optionalText,
    contact: optionalText,
    opportunity_type_ids: z.array(z.string()),
    description: optionalText,
    pdf_pg_url: optionalText,
    stage: z.enum(STAGES),
    lost_reason: optionalText,
    value: z.union([
      z.string().refine((v) => v === "" || (!Number.isNaN(Number(v)) && Number(v) >= 0), "Value must be a positive number"),
    ]).optional(),
    follow_up_date: optionalText,
    lead_date: optionalText,
    remarks: optionalText,
  })
  .refine((data) => data.stage !== "Lost" || !!data.lost_reason?.trim(), {
    message: "Lost reason is required when stage is Lost",
    path: ["lost_reason"],
  });

export type OpportunityFormValues = z.infer<typeof opportunityFormSchema>;

export const emptyOpportunityForm: OpportunityFormValues = {
  kind: "service", company: "", client_name: "", contact: "",
  opportunity_type_ids: [], description: "", pdf_pg_url: "",
  stage: "Open", lost_reason: "", value: "", follow_up_date: "", lead_date: "", remarks: "",
};
