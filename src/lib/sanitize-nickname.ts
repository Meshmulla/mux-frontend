export const MAX_NICKNAME_LENGTH = 64;

const HTML_ESCAPES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

/**
 * Normalizes a nickname into its canonical stored/rendered form.
 *
 * Pipeline: strip control characters, trim, HTML-escape `& < > " '`, then
 * enforce MAX_NICKNAME_LENGTH on the *escaped* result. The cap applies
 * post-escaping so the persisted/rendered value never exceeds the limit.
 */
export function normalizeNickname(input: string): string {
	const stripped = input.replace(/[\u0000-\u001F\u007F]/g, "").trim();
	const escaped = stripped.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
	return escaped.slice(0, MAX_NICKNAME_LENGTH);
}

export function sanitizeNickname(input: string): string {
	return normalizeNickname(input);
}

export function isValidNickname(input: string): boolean {
	const trimmed = input.replace(/[\u0000-\u001F\u007F]/g, "").trim();
	return trimmed.length > 0 && trimmed.length <= MAX_NICKNAME_LENGTH;
}
