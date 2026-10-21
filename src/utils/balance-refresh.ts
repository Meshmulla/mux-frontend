import { useCallback, useEffect, useReducer, useRef } from "react";

// Stale-while-revalidate balance state: a refresh keeps the last known balance
// on screen (no flicker to a skeleton/zero) and out-of-order responses are
// dropped so an older request can never overwrite a newer balance.

export const BALANCE_REFRESH_FAILED = "BALANCE_REFRESH_FAILED";

export type BalanceState = {
	balance: number | null;
	refreshing: boolean;
	error: string | null;
	requestId: number;
	/** Last stable (non-refreshing) state, so a stale response is a true no-op. */
	lastStable?: BalanceState;
};

export type BalanceAction =
	| { type: "start"; requestId: number }
	| { type: "success"; requestId: number; balance: number }
	| { type: "failure"; requestId: number; error?: string };

export const initialBalanceState: BalanceState = {
	balance: null,
	refreshing: false,
	error: null,
	requestId: 0,
};

export function balanceReducer(
	state: BalanceState,
	action: BalanceAction,
): BalanceState {
	switch (action.type) {
		case "start":
			return {
				...state,
				refreshing: true,
				requestId: action.requestId,
				lastStable: state.refreshing ? (state.lastStable ?? state) : state,
			};
		case "success":
			if (action.requestId !== state.requestId) {
				return state;
			}
			return {
				...state,
				balance: action.balance,
				refreshing: false,
				error: null,
			};
		case "failure":
			// Keep the last known balance; surface the error without blanking it.
			if (action.requestId !== state.requestId) {
				return state.lastStable ?? state;
			}
			return {
				...state,
				refreshing: false,
				error: action.error ?? BALANCE_REFRESH_FAILED,
			};
	}
}

export interface BalanceRefreshState {
	balance: number | null;
	refreshing: boolean;
	error: string | null;
	refresh: () => Promise<void>;
}

/**
 * Stale-while-revalidate balance hook.
 *
 * Keeps the last known balance visible while a fresh request is in flight so
 * the UI never flickers to a skeleton or zero. The latest `fetchBalance` is
 * held in a ref so the returned `refresh` stays stable across renders — an
 * inline arrow callback will not cause a fetch per render. The mount effect
 * runs once; subsequent fetches happen only when `refresh` is called.
 */
export function useBalanceRefresh(
	fetchBalance: () => Promise<number>,
): BalanceRefreshState {
	const [state, dispatch] = useReducer(balanceReducer, initialBalanceState);

	const fetchRef = useRef(fetchBalance);
	fetchRef.current = fetchBalance;

	const counter = useRef(0);

	const refresh = useCallback(async () => {
		const requestId = ++counter.current;
		dispatch({ type: "start", requestId });
		try {
			const balance = await fetchRef.current();
			dispatch({ type: "success", requestId, balance });
		} catch {
			dispatch({ type: "failure", requestId, error: BALANCE_REFRESH_FAILED });
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	return { ...state, refresh };
}
