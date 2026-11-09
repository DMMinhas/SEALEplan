/** Display form: Unicode-normalised, whitespace collapsed and trimmed. */
export function cleanText(s: string): string {
  return s.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

/** Comparison form: case- and whitespace-insensitive. */
export function normalizeText(s: string): string {
  return cleanText(s).toLowerCase();
}

/**
 * Identity of a respondent within a poll. Uses the ASCII unit separator,
 * which is rejected in user input, so "a|b"+"c" can never collide with "a"+"b|c".
 */
export function nameKey(name: string, organization: string): string {
  return `${normalizeText(name)}\u001f${normalizeText(organization)}`;
}

export const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
