// A trailing slash in APP_BASE_URL (easy to paste in by accident when
// setting a hosting platform's env var) breaks CORS's exact-string-match
// requirement and produces double-slash links in emails. Normalized once,
// here, so every call site gets the same clean value.
export function getAppBaseUrl(): string | undefined {
  return getAllowedOrigins()[0];
}

// APP_BASE_URL may hold more than one origin, comma-separated — e.g. the
// production domain plus a Vercel preview URL. The first one is treated as
// canonical for links generated in emails; all of them are valid for CORS.
export function getAllowedOrigins(): string[] {
  return (process.env.APP_BASE_URL ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
}
