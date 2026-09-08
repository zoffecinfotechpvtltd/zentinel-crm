import { z } from "zod";

// Mirrors backend/src/routes/projects.ts's createProjectSchema/
// updateProjectSchema (see [[lead]] schema for why this is hand-duplicated
// rather than shared). client_id/opportunity_id/assigned_to stay outside
// the resolved-value validation for the "existing record" checks (the
// backend still verifies those against the DB) - this schema only enforces
// what's knowable client-side: required fields and the start/due date order.
export const STATUSES = ["Not Started", "In Progress", "Awaiting Client", "Completed", "On Hold"] as const;

const optionalText = z.string().optional().or(z.literal(""));

export const projectFormSchema = z
  .object({
    name: z.string().min(1, "Project name is required"),
    client_id: z.string().min(1, "Client is required"),
    opportunity_id: optionalText,
    assigned_to: optionalText,
    start_date: optionalText,
    due_date: optionalText,
    status: z.enum(STATUSES),
    progress: z.string().refine((v) => v !== "" && !Number.isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 100, "Progress must be between 0 and 100"),
    remarks: optionalText,
  })
  .refine((data) => !data.start_date || !data.due_date || data.due_date >= data.start_date, {
    message: "Due date must be on or after the start date",
    path: ["due_date"],
  });

export type ProjectFormValues = z.infer<typeof projectFormSchema>;

export const emptyProjectForm: ProjectFormValues = {
  name: "", client_id: "", opportunity_id: "", assigned_to: "", start_date: "", due_date: "",
  status: "Not Started", progress: "0", remarks: "",
};
