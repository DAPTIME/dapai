import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email.trim());
}

/**
 * The single source of truth for how DAP Games addresses a person.
 *
 * Google hands us "Devansh Pancholia", GitHub hands us a username, and
 * email signup hands us whatever was typed — so every surface has to run
 * the raw value through here or the same account gets greeted by a
 * different name on different pages. Always the FIRST name.
 */
export function firstName(raw?: string | null, fallback = "friend") {
  const cleaned = (raw ?? "")
    .trim()
    // Strip an email if that's all we got, then split camel/underscore/dot
    // handles like "devansh.pancholia" or "devansh_p" into words.
    .replace(/@.*$/, "")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return fallback;
  const first = cleaned.split(" ")[0]!;
  return first.charAt(0).toUpperCase() + first.slice(1);
}
