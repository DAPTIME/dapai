/**
 * Single source of truth for password rules.
 *
 * Deliberately simple and predictable: a clear minimum length and a few
 * obvious-guess checks. No strength meter, no colour-coded scoring.
 * Leaked-password screening happens server-side (Have I Been Pwned).
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 200;

const OBVIOUS = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "1234567890",
  "qwertyui",
  "qwerty123",
  "iloveyou",
  "letmein1",
  "dapai123",
  "administrator",
]);

/**
 * Returns an error message when the password is unacceptable, or null when
 * it passes. Used identically on the client and on the server.
 */
export function checkPassword(
  password: string,
  opts: { email?: string | null; name?: string | null } = {}
): string | null {
  const pw = password ?? "";
  if (pw.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (pw.length > PASSWORD_MAX_LENGTH) {
    return "Password is too long.";
  }
  if (pw.trim().length !== pw.length) {
    return "Password can't start or end with a space.";
  }
  const lower = pw.toLowerCase();
  if (OBVIOUS.has(lower)) {
    return "That password is too easy to guess. Please pick another.";
  }
  if (/^(.)\1+$/.test(pw)) {
    return "Password can't be the same character repeated.";
  }
  const localPart = opts.email?.split("@")[0]?.toLowerCase();
  if (localPart && localPart.length >= 3 && lower.includes(localPart)) {
    return "Password can't contain your email address.";
  }
  const name = opts.name?.trim().toLowerCase();
  if (name && name.length >= 3 && lower.includes(name)) {
    return "Password can't contain your name.";
  }
  return null;
}

/** Throwing variant for server functions. */
export function assertPasswordPolicy(
  password: string,
  opts: { email?: string | null; name?: string | null } = {}
) {
  const problem = checkPassword(password, opts);
  if (problem) throw new Error(problem);
}
