// src/dev/ci-mocks.ts
// Tiny CI helpers so smoke/e2e have deterministic UI state

(function installCiUiMocks(){
  try {
    const params = new URLSearchParams(location.search || '');
    const isCi = params.has('ci');
    const uiMock = params.get('uiMock') === '1';
    const mockFolder = params.get('mockFolder') === '1';
    if (!isCi) return;

    const fixtures = [
      { id: 'ci-1', name: 'Fixture Episode · CI', text: '[s1] CI Fixture [/s1]\nLine 1\nLine 2' },
      { id: 'ci-2', name: 'Mirror Script · CI', text: 'Mirror ready' },
    ];

    function seedSelects(): boolean {
      try { (window as any).__tpMockFolderMode = true; } catch {}
      const main = document.getElementById('scriptSelect') as HTMLSelectElement | null;
      const side = document.getElementById('scriptSelectSidebar') as HTMLSelectElement | null;
      const apply = (sel: HTMLSelectElement | null) => {
        if (!sel) return;
        sel.innerHTML = '';
        fixtures.forEach((f, idx) => {
          const opt = new Option(f.name, f.id);
          (opt as any).dataset.fixture = '1';
          if (idx === 0) opt.selected = true;
          sel.append(opt);
        });
        sel.disabled = false;
        try { sel.dataset.count = String(fixtures.length); } catch {}
      };
      apply(main);
      apply(side);
      try { window.dispatchEvent(new CustomEvent('tp:folderScripts:populated', { detail: { count: fixtures.length } })); } catch {}
      return !!(main || side);
    }

    // 1) Ensure a sample is visible in the editor so harness sees content
    if (uiMock) {
      try {
        const ed = document.getElementById('editor') as HTMLTextAreaElement | null;
        if (ed && !ed.value) {
          const sample = `[s1] Sample script for CI [/s1]\n\nThis is a smoke-test sample body.`;
          ed.value = sample;
          // Announce to renderers if they listen to tp:script-load
          try { document.dispatchEvent(new CustomEvent('tp:script-load', { detail: { name: 'CI Sample.txt', text: sample } })); } catch {}
        }
      } catch {}
    }

    // 2) Reflect mock folder status in any visible label and seed selects
    if (mockFolder) {
      try {
        const labelWrap = document.querySelector('[data-test-id="rec-folder-label"]') as HTMLElement | null;
        const nameSpan = document.getElementById('autoRecordFolderName') as HTMLElement | null;
        if (labelWrap && nameSpan) {
          nameSpan.textContent = 'MockRecordings';
          try { (labelWrap as any).dataset.mockApplied = '1'; } catch {}
        }
      } catch {}

      // Seed script selects with deterministic fixtures for CI mirrors
      const trySeed = () => { try { seedSelects(); } catch {} };
      trySeed();
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', trySeed, { once: true });
      } else {
        setTimeout(trySeed, 350);
      }
      // Re-seed a few times to survive any late clears from mappers
      let attempts = 0;
      const iv = setInterval(() => {
        attempts += 1;
        trySeed();
        if (attempts >= 4) clearInterval(iv);
      }, 500);
    }
  } catch {}
})();
