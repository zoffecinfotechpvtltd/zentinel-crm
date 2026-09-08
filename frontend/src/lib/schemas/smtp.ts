import { z } from "zod";

// Mirrors backend/src/routes/settings.ts's smtpConfigSchema (see [[lead]]
// schema for why this is hand-duplicated rather than shared). `pass` is
// optional here for the same reason it's optional server-side: leaving it
// blank on an edit means "keep the currently-saved password", not "clear
// it" - the backend fills the real value back in when this is blank.
export const smtpFormSchema = z.object({
  host: z.string().min(1, "SMTP host is required"),
  port: z.string().refine((v) => v.trim() !== "" && Number.isInteger(Number(v)) && Number(v) > 0, "Port must be a positive whole number"),
  user: z.string().min(1, "Username is required"),
  pass: z.string().optional(),
  from: z.string().min(1, "\"From\" address is required"),
});

export type SmtpFormValues = z.infer<typeof smtpFormSchema>;

export const emptySmtpForm: SmtpFormValues = { host: "", port: "587", user: "", pass: "", from: "" };

// Password is only actually optional once a config already exists to fall
// back to - the backend rejects a blank pass outright on the very first
// save. That's server-side state, not a pure function of this form's own
// values, so it's a separate refine the caller applies with the right
// `requirePassword` for the SMTP config it currently has (or doesn't).
export function buildSmtpFormSchema(requirePassword: boolean) {
  return smtpFormSchema.refine((data) => !requirePassword || !!data.pass?.trim(), {
    message: "Password is required",
    path: ["pass"],
  });
}
