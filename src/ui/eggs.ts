// src/ui/eggs.ts
// Easter eggs and lightweight UX add-ons.
// Safe to import in the browser; references globals defensively.

declare global {
	interface Window {
		setStatus?: (msg: string) => void;
		sendToDisplay?: (payload: any) => void;
		APP_VERSION?: string;
		__TP_DEV?: boolean;
	}
}

// Minimal safe toast shim (avoid hard dependency on a specific toast module)
function safeToast(msg: unknown): void {
	try {
		if (typeof window === 'undefined') return;
		const fn = typeof window.toast === 'function'
			? window.toast
			: (m: string) => console.debug('[toast]', m);
		fn(String(msg ?? ''));
	} catch {
		// swallow
	}
}

/**
 * Install all small “fun” eggs that only affect CSS/UX.
 * - Restores theme from localStorage (egg.theme).
 * - Konami code toggles `savanna` theme.
 * - dB meter rapid click toggles `party` class.
 * - Alt+click on help title toggles advanced panel visibility.
 * - Typing `:roar` in the editor triggers a quick lion overlay.
 */
export function installEasterEggs(): void {
	if (typeof window === 'undefined' || typeof document === 'undefined') return;

	// Restore theme from localStorage
	try {
		const savedTheme = window.localStorage.getItem('egg.theme');
		if (savedTheme) {
			document.body.classList.add(savedTheme);
		}
	} catch {
		// ignore
	}

	// Konami unlock -> toggles 'savanna' class
	const konamiSequence = [
		'ArrowUp',
		'ArrowUp',
		'ArrowDown',
		'ArrowDown',
		'ArrowLeft',
		'ArrowRight',
		'ArrowLeft',
		'ArrowRight',
		'b',
		'a',
	];

	let konamiPos = 0;

	window.addEventListener('keydown', (e: KeyboardEvent) => {
		const key = (e.key || '').toLowerCase();

		const expected = konamiSequence[konamiPos];
		const normalizedExpected = typeof expected === 'string' ? expected.toLowerCase() : expected;

		if (key === normalizedExpected) {
			konamiPos += 1;
			if (konamiPos === konamiSequence.length) {
				konamiPos = 0;
				document.body.classList.toggle('savanna');
				const on = document.body.classList.contains('savanna');

				try {
					window.localStorage.setItem('egg.theme', on ? 'savanna' : '');
				} catch {
					// ignore
				}

				try {
					const status = on ? 'Savanna unlocked 🦁' : 'Savanna off';
					(window.setStatus ?? (() => {}))(status);
				} catch {
					// ignore
				}
			}
		} else {
			konamiPos = 0;
		}
	});

	// dB meter party mode (5 clicks within 1.2s)
	// Use top-bar meter as the single source of truth; fall back to legacy if present
	const meter =
		(document.getElementById('dbMeterTop') as HTMLElement | null) ??
		(document.getElementById('dbMeter') as HTMLElement | null);

	if (meter) {
		let clicks = 0;
		let t0 = 0;

		meter.addEventListener('click', () => {
			const t = performance.now();
			if (t - t0 > 1200) {
				clicks = 0;
			}
			t0 = t;
			clicks += 1;

			if (clicks >= 5) {
				clicks = 0;
				meter.classList.toggle('party');
				const on = meter.classList.contains('party');
				safeToast(on ? 'Party mode on 🎉' : 'Party mode off');
			}
		});
	}

	// Help title alt-click -> show hidden "Advanced" tools
	const helpTitle = document.getElementById('shortcutsTitle') as HTMLElement | null;
	const advanced = document.getElementById('helpAdvanced') as HTMLElement | null;

	if (helpTitle && advanced) {
		helpTitle.addEventListener('click', (e: MouseEvent) => {
			if (e.altKey) {
				advanced.classList.toggle('hidden');
			}
		});
	}

	// :roar in editor -> quick emoji overlay
	const editor = document.getElementById('editor') as HTMLTextAreaElement | null;

	if (editor) {
		editor.addEventListener('input', () => {
			const v = editor.value.slice(-5).toLowerCase();
			if (v === ':roar') {
				editor.value = editor.value.slice(0, -5);
				roarOverlay();
				// Fire an input event so any listeners see the updated value
				editor.dispatchEvent(new Event('input', { bubbles: true }));
			}
		});
	}
}

/**
 * Brief lion overlay in the center of the screen.
 * Fades itself out after ~1 second.
 */
export function roarOverlay(): void {
	if (typeof document === 'undefined') return;

	const overlay = document.createElement('div');
	overlay.style.position = 'fixed';
	overlay.style.inset = '0';
	overlay.style.display = 'grid';
	overlay.style.placeItems = 'center';
	overlay.style.zIndex = '99999';
	overlay.style.pointerEvents = 'none';
	overlay.style.fontSize = '6rem';
	overlay.style.opacity = '1';
	overlay.style.transition = 'opacity 400ms ease-out';
	overlay.innerText = '🦁';

	document.body.appendChild(overlay);

	// quick fade + remove
	window.setTimeout(() => {
		overlay.style.opacity = '0';
		window.setTimeout(() => {
			overlay.remove();
		}, 450);
	}, 600);
}

/**
 * CK egg: theme toggle that can also notify the display window
 * so both sides stay visually in sync.
 */
export function installCKEgg(): void {
	if (typeof window === 'undefined' || typeof document === 'undefined') return;

	const enable = (silent = false): void => {
		document.body.classList.add('ck');

		try {
			window.localStorage.setItem('egg.ck', '1');
		} catch {
			// ignore
		}

		try {
			window.sendToDisplay?.({ type: 'toggle-ck', on: true });
		} catch {
			// ignore
		}

		if (!silent) {
			safeToast('CK on');
		}
	};

	const disable = (silent = false): void => {
		document.body.classList.remove('ck');

		try {
			window.localStorage.removeItem('egg.ck');
		} catch {
			// ignore
		}

		try {
			window.sendToDisplay?.({ type: 'toggle-ck', on: false });
		} catch {
			// ignore
		}

		if (!silent) {
			safeToast('CK off');
		}
	};

	// Restore from localStorage
	try {
		if (window.localStorage.getItem('egg.ck')) {
			enable(true);
		}
	} catch {
		// ignore
	}

	// URL opts (?ck=1 / ?ck=0)
	try {
		const url = new URL(window.location.href);
		const ckParam = url.searchParams.get('ck');
		if (ckParam === '1') {
			enable();
		} else if (ckParam === '0') {
			disable();
		}
	} catch {
		// ignore
	}

	// Keyboard toggle: Ctrl+Alt+C
	window.addEventListener('keydown', (e: KeyboardEvent) => {
		const key = (e.key || '').toLowerCase();
		if (e.ctrlKey && e.altKey && key === 'c') {
			e.preventDefault();
			const isOn = document.body.classList.contains('ck');
			if (isOn) {
				disable();
			} else {
				enable();
			}
		}
	});

	// Typing :ck in editor toggles on
	const editor = document.getElementById('editor') as HTMLTextAreaElement | null;
	if (editor) {
		editor.addEventListener('input', () => {
			const v = editor.value.slice(-3).toLowerCase();
			if (v === ':ck') {
				editor.value = editor.value.slice(0, -3);
				enable();
				editor.dispatchEvent(new Event('input', { bubbles: true }));
			}
		});
	}
}

/**
 * About popover / overlay.
 * Triggered by Ctrl+Alt+K.
 */
export function installAboutPopover(): void {
	if (typeof window === 'undefined' || typeof document === 'undefined') return;

	let about: HTMLDivElement | null = null;

	function showAbout(): void {
		if (!about) {
			about = document.createElement('div');
			about.className = 'overlay';

			const built = new Date().toLocaleString();
			const ver = window.APP_VERSION || 'local';

			about.innerHTML = `
        <div class="sheet" style="max-width:560px">
          <header style="display:flex;justify-content:space-between;align-items:center;gap:8px">
            <h3 style="margin:0">Teleprompter • About</h3>
            <button class="btn-chip" id="aboutClose">Close</button>
          </header>
          <section class="about-body">
            <p>Version: <strong>${ver}</strong></p>
            <p>Built: <time>${built}</time></p>
            <p>This is part of the Creator's Forge toolset.</p>
          </section>
        </div>
      `;

			document.body.appendChild(about);

			about.addEventListener('click', (e: MouseEvent) => {
				if (e.target === about) {
					about!.classList.add('hidden');
				}
			});

			const closeBtn = about.querySelector('#aboutClose') as HTMLButtonElement | null;
			if (closeBtn) {
				closeBtn.onclick = () => about!.classList.add('hidden');
			}
		}

		about.classList.remove('hidden');
	}

	window.addEventListener('keydown', (e: KeyboardEvent) => {
		const key = (e.key || '').toLowerCase();
		if (e.ctrlKey && e.altKey && key === 'k') {
			e.preventDefault();
			showAbout();
		}
	});
}
