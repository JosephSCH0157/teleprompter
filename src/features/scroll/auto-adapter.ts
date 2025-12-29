// src/features/scroll/auto-adapter.ts
// Thin TS adapter around the existing auto/PLL scroll engine.
// Presents the interface expected by the mode router.

import type { AutoEngine, ScrollMode } from './mode-router';

declare global {
	interface Window {
		__tpAuto?: {
			set?: (on: boolean) => void;
			setEnabled?: (on: boolean) => void;
			setMode?: (mode: string) => void;
			setStepPx?: (px: number) => void;
			rebase?: (top?: number) => void;
		};
	}
}

/**
 * Wrap the existing global auto scroll engine (if present) in the
 * AutoScrollAPI shape expected by the mode router.
 *
 * If the engine is not available, returns null and the router will
 * simply not drive auto/hybrid modes (safe fallback).
 */
export function getAutoScrollApi(): AutoEngine | null {
	if (typeof window === 'undefined') return null;

	const w = window as Window;
	const auto = w.__tpAuto;
	if (!auto || typeof auto.setEnabled !== 'function') {
		return null;
	}

	const api: AutoEngine = {
		setEnabled(on: boolean): void {
			try {
				auto.setEnabled?.(!!on);
			} catch {
				// ignore
			}
		},
		setMode(mode: ScrollMode): void {
			try {
				// Pass through exact values; legacy can coerce internally if needed.
				auto.setMode?.(mode);
			} catch {
				// ignore
			}
		},
		start(): void {
			try { auto.setEnabled?.(true); } catch {}
		},
		stop(): void {
			try { auto.setEnabled?.(false); } catch {}
		},
	};

	return api;
}
