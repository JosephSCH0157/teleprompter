// src/dev/ci-mocks.ts
// Tiny CI helpers so smoke/e2e have deterministic UI state

(function installCiUiMocks(){
  try {
    const params = new URLSearchParams(location.search || '');
    const isCi = params.has('ci');
    const uiMock = params.get('uiMock') === '1';
    const mockFolder = params.get('mockFolder') === '1';
    if (!isCi) return;

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

    // 2) Reflect mock folder status in any visible label
    if (mockFolder) {
      try {
        const labelWrap = document.querySelector('[data-test-id="rec-folder-label"]') as HTMLElement | null;
        const nameSpan = document.getElementById('autoRecordFolderName') as HTMLElement | null;
        if (labelWrap && nameSpan) {
          nameSpan.textContent = 'MockRecordings';
          try { (labelWrap as any).dataset.mockApplied = '1'; } catch {}
        }
      } catch {}

      // Also ensure script selects have at least one option if empty
      try {
        const main = document.getElementById('scriptSelect') as HTMLSelectElement | null;
        const side = document.getElementById('scriptSelectSidebar') as HTMLSelectElement | null;
        const populate = (sel: HTMLSelectElement | null) => {
          if (!sel) return;
          if (sel.options.length > 0) return;
          const opt = document.createElement('option');
          opt.value = 'ci-sample';
          opt.textContent = 'CI Sample Script';
          sel.appendChild(opt);
          sel.selectedIndex = 0;
        };
        populate(main); populate(side);
      } catch {}
    }
  } catch {}
})();
