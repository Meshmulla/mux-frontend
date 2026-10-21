import { createHash } from "node:crypto";
import { SEND_GATE_CODES } from "@/lib/feature-flags/send-flows";

/**
 * Shared contract for the feature-flagged send entrypoint (issue #803).
 *
 * The route and its tests import these helpers so the client-facing body
 * shape, validation rules, and error codes stay in one place.
 */

export const MAX_BODY_BYTES = 4 * 1024;
export const MAX_MEMO_BYTES = 28;

export const WALLET_ID_RE = /^[A-Za-z0-9_-]{3,64}$/;
/** StrKey account (G…) or contract (C…) address: 56 base32 characters. */
export const DESTINATION_RE = /^[GC][A-Z2-7]{55}$/;
export const AMOUNT_RE = /^\d{1,18}(\.\d{1,7})?$/;
/** `native`, or `CODE:ISSUER` where the issuer is a StrKey address. */
export const ASSET_RE = /^(native|[A-Za-z0-9]{1,12}:[GC][A-Z2-7]{55})$/;
/**
 * Accepted `network` identifiers: a short, lowercase, well-formed slug such
 * as `testnet`, `mainnet`, or `futurenet`. Bounded to 3-32 characters so an
 * arbitrarily long value cannot be forwarded to the backend.
 */
export const NETWORK_RE = /^[a-z][a-z0-9-]{2,31}$/;

export const SEND_ERROR_CODES = {
	...SEND_GATE_CODES,
	UNAUTHORIZED: "SEND_UNAUTHORIZED",
	AUTH_EXPIRED: "SEND_AUTH_EXPIRED",
	FORBIDDEN: "SEND_FORBIDDEN",
	DELEGATE_REVOKED: "SEND_DELEGATE_REVOKED",
	RATE_LIMITED: "SEND_RATE_LIMITED",
	IDEMPOTENCY_KEY_REQUIRED: "SEND_IDEMPOTENCY_KEY_REQUIRED",
	INVALID_INPUT: "SEND_INVALID_INPUT",
	REQUEST_IN_PROGRESS: "SEND_REQUEST_IN_PROGRESS",
	MAINTENANCE: "SEND_MAINTENANCE",
	BACKEND_UNAVAILABLE: "SEND_BACKEND_UNAVAILABLE",
	UPSTREAM_ERROR: "SEND_UPSTREAM_ERROR",
} as const;

export type SendErrorCode =
	(typeof SEND_ERROR_CODES)[keyof typeof SEND_ERROR_CODES];

export interface SendRequestBody {
	/** 3-64 URL-safe characters. */
	walletId: string;
	/** 56-character Stellar account address (base32). */
	destination: string;
	/** Decimal amount, up to 18 integer and 7 fractional digits. */
	amount: string;
	/** 1-12 alphanumeric asset code. */
	asset: string;
	/**
	 * Network identifier: a short, lowercase slug matching
	 * `/^[a-z][a-z0-9-]{2,31}$/` (e.g. `testnet`, `mainnet`, `futurenet`).
	 */
	network: string;
	/** Optional memo, at most 28 UTF-8 bytes. */
	memo?: string;
}

export function isValidIdempotencyKey(key: string): boolean {
	return /^[A-Za-z0-9_-]{16,128}$/.test(key);
}

function memoByteLength(memo: string): number {
	return new TextEncoder().encode(memo).length;
}

export function parseSendBody(raw: unknown): SendRequestBody | null {
	if (typeof raw !== "object" || raw === null) return null;
	const input = raw as Record<string, unknown>;
	const allowedKeys = new Set([
		"walletId",
		"destination",
		"amount",
		"asset",
		"network",
		"memo",
	]);
	if (Object.keys(input).some((key) => !allowedKeys.has(key))) return null;

	const { walletId, destination, amount, asset, network, memo } = input;

	if (typeof walletId !== "string" || !WALLET_ID_RE.test(walletId)) {
		return null;
	}
	if (typeof destination !== "string" || !DESTINATION_RE.test(destination)) {
		return null;
	}
	if (
		typeof amount !== "string" ||
		!AMOUNT_RE.test(amount) ||
		Number(amount) <= 0
	) {
		return null;
	}
	if (typeof asset !== "string" || !ASSET_RE.test(asset)) {
		return null;
	}
	if (typeof network !== "string" || !NETWORK_RE.test(network)) {
		return null;
	}

	const body: SendRequestBody = {
		walletId,
		destination,
		amount,
		asset,
		network,
	};

	if (memo !== undefined) {
		if (typeof memo !== "string" || memoByteLength(memo) > MAX_MEMO_BYTES) {
			return null;
		}
		body.memo = memo;
	}

	return body;
}

export function hashSendBody(body: SendRequestBody): string {
	return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}
