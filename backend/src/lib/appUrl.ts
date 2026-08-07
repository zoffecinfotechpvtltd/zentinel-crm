// A trailing slash in APP_BASE_URL (easy to paste in by accident when
// setting a hosting platform's env var) breaks CORS's exact-string-match
// requirement and produces double-slash links in emails. Normalized once,
// here, so every call site gets the same clean value.
export function getAppBaseUrl(): string | undefined {
  return process.env.APP_BASE_URL?.replace(/\/$/, "");
}
