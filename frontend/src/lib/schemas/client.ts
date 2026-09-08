import { z } from "zod";

// Mirrors backend/src/routes/clients.ts's createClientSchema (see
// [[lead]] schema for why this is hand-duplicated rather than shared).
export const clientFormSchema = z.object({
  company: z.string().min(1, "Company name is required"),
  gstin: z.string().optional().or(z.literal("")),
});

export type ClientFormValues = z.infer<typeof clientFormSchema>;

export const emptyClientForm: ClientFormValues = { company: "", gstin: "" };
