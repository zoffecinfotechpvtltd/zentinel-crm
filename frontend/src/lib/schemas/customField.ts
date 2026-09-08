import { z } from "zod";

// Mirrors backend/src/routes/customFields.ts's createSchema (see [[lead]]
// schema for why this is hand-duplicated rather than shared) plus its
// select-needs-at-least-one-option check, which the backend enforces as a
// second, separate condition rather than inside its own Zod object.
export const ENTITY_TYPES = ["lead", "opportunity", "client"] as const;
export const FIELD_TYPES = ["text", "number", "date", "boolean", "select"] as const;

export const customFieldFormSchema = z
  .object({
    entity_type: z.enum(ENTITY_TYPES),
    key: z.string().min(1, "Key is required").regex(/^[a-z][a-z0-9_]*$/, "Key must be lowercase letters, numbers, and underscores, starting with a letter"),
    label: z.string().min(1, "Label is required"),
    field_type: z.enum(FIELD_TYPES),
    select_options: z.string().optional().or(z.literal("")),
  })
  .refine((data) => data.field_type !== "select" || !!data.select_options?.trim(), {
    message: "At least one option is required for a select field",
    path: ["select_options"],
  });

export type CustomFieldFormValues = z.infer<typeof customFieldFormSchema>;

export const emptyCustomFieldForm: CustomFieldFormValues = {
  entity_type: "lead", key: "", label: "", field_type: "text", select_options: "",
};
