// Mirrors backend/src/lib/passwordPolicy.ts — client-side check so the form
// shows a specific reason before round-tripping to the server at all.
export function passwordPolicyError(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[a-zA-Z]/.test(password)) return "Password must include at least one letter.";
  if (!/[0-9]/.test(password)) return "Password must include at least one number.";
  return null;
}
