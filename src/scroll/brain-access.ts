import type { ScrollBrain } from './scroll-brain';
import { createScrollBrain } from './scroll-brain';

let scrollBrain: ScrollBrain | null = null;

function ensureScrollBrain(): ScrollBrain {
	if (!scrollBrain) {
		scrollBrain = createScrollBrain();
		try { (window as any).__tpScrollBrain = scrollBrain; } catch {}
	}
	return scrollBrain;
}

export function getScrollBrain(): ScrollBrain {
	return ensureScrollBrain();
}
