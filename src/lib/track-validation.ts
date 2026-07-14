// Shared Poly Racer track validation. Used by the editor for instant feedback
// and by the server fn for publish enforcement.

export type TrackParams = {
  amp1: number;
  freq1: number;
  amp2: number;
  freq2: number;
  half: number;
  phase: number;
};

export const TRACK_W = 480;

// Starter profanity list. Add more later without a migration.
const BAD_WORDS = [
  "fuck", "shit", "bitch", "cunt", "dick", "pussy", "asshole", "nigger",
  "faggot", "retard", "slut", "whore", "nazi", "kike", "chink", "spic",
  "porn", "cum", "sex",
];

export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 3) return "Name must be at least 3 characters.";
  if (trimmed.length > 40) return "Name must be at most 40 characters.";
  if (!/^[a-zA-Z0-9 _\-'.!?]+$/.test(trimmed)) {
    return "Name can only use letters, numbers, spaces, and - _ ' . ! ?";
  }
  if (/(.)\1{4,}/.test(trimmed)) return "Name has too many repeated characters.";
  const lower = trimmed.toLowerCase().replace(/[^a-z]/g, "");
  for (const w of BAD_WORDS) {
    if (lower.includes(w)) return "Name contains a blocked word.";
  }
  return null;
}

export function validateParams(p: TrackParams, goal: number): string | null {
  if (!Number.isFinite(goal) || goal < 400 || goal > 3000) {
    return "Goal must be between 400 and 3000.";
  }
  if (p.half < 55 || p.half > 110) return "Road width must be between 55 and 110.";
  if (p.amp1 < 0 || p.amp1 > 200) return "Amp 1 out of range.";
  if (p.amp2 < 0 || p.amp2 > 200) return "Amp 2 out of range.";
  if (p.freq1 <= 0 || p.freq1 > 0.05) return "Freq 1 out of range.";
  if (p.freq2 <= 0 || p.freq2 > 0.05) return "Freq 2 out of range.";
  const maxAmp = TRACK_W / 2 - p.half - 20;
  if (p.amp1 + p.amp2 > maxAmp) {
    return `Track leaves the canvas. Reduce amps (max total ${maxAmp.toFixed(0)} for this road width).`;
  }
  return null;
}

export function validateForPublish(name: string, p: TrackParams, goal: number): string | null {
  return validateName(name) ?? validateParams(p, goal);
}
