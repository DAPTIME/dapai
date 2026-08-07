/**
 * Leaked-password protection.
 *
 * Uses the Have I Been Pwned "range" API with k-anonymity: only the first five
 * characters of the SHA-1 hash ever leave the server, so the password itself is
 * never transmitted. If the service is unreachable we fail open (never block a
 * legitimate signup because of a third-party outage).
 */
import { createHash } from "crypto";

export async function isPasswordLeaked(password: string): Promise<boolean> {
  try {
    const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
    });
    if (!res.ok) return false;
    const body = await res.text();
    for (const line of body.split("\n")) {
      const [hashSuffix, count] = line.trim().split(":");
      if (hashSuffix === suffix && Number(count) > 0) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function assertPasswordNotLeaked(password: string) {
  if (await isPasswordLeaked(password)) {
    throw new Error(
      "This password has appeared in a known data breach. Please choose a different one."
    );
  }
}
