// src/ui/settings-export-import.ts
// Minimal UI binder for Settings export/import (JSON snapshot).
import { exportSettings, importSettings } from '../core/settings-types';

export function bindSettingsExportImport(btnExportSel: string, btnImportSel: string) {
  const be = document.querySelector(btnExportSel) as HTMLButtonElement | null;
  const bi = document.querySelector(btnImportSel) as HTMLButtonElement | null;
  if (!be && !bi) return;

  if (be) {
    be.addEventListener('click', () => {
      try {
        // Use in-memory or default settings; if a richer store exists, prefer it
        const current = (window as any).__tpSettings?.get?.() || (window as any).__tpSettingsStore || null;
        const data = exportSettings(current || undefined);
        const blob = new Blob([data], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'anvil-settings.json';
        document.body.appendChild(a); a.click(); a.remove();
        (window as any).HUD?.log?.('settings:export', { ok: true });
      } catch (e) {
        (window as any).HUD?.log?.('settings:export', { ok: false, e: String(e) });
      }
    });
  }

  if (bi) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'application/json'; input.hidden = true;
    document.body.appendChild(input);

    bi.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const f = input.files?.[0]; if (!f) return;
      try {
        const text = await f.text();
        const ok = importSettings(text);
        (window as any).HUD?.log?.('settings:import', { ok });
        // Notify runtime so any binders can re-sync
        window.dispatchEvent(new CustomEvent('tp:settings-imported'));
        // If a primary settings store exists, patch it for consistency
        try {
          const base = (window as any).__tpSettings;
          const snap = (window as any).__tpSettingsStore;
          if (base?.patch && snap) base.patch(snap);
        } catch {}
      } catch (e) {
        (window as any).HUD?.log?.('settings:import', { ok: false, e: String(e) });
      } finally {
        input.value = '';
      }
    });
  }
}
