/** Shared hashing for recovery answers (salted SHA-256, stored as "salt:hash"). */
import { createHash, randomBytes } from "crypto";

export function hashAnswer(answer: string, salt: string) {
  return createHash("sha256").update(`${salt}:${answer.trim().toLowerCase()}`).digest("hex");
}

export function makeStored(answer: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${hashAnswer(answer, salt)}`;
}
