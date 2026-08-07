import { z } from "zod";

// Length-only was the entire policy before this — a password like
// "aaaaaaaa" passed. Requiring at least one letter and one digit blocks the
// most common trivial passwords without the false-negative-heavy
// complexity theatre of forcing symbols/mixed-case too.
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .refine((v) => /[a-zA-Z]/.test(v), "Password must include at least one letter")
  .refine((v) => /[0-9]/.test(v), "Password must include at least one number");
