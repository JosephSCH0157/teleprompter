// scripts-store.ts
// Centralized script store for local and mapped-folder scripts.

export type ScriptMeta = {
  id: string;
  title: string;
  updated?: string;
};

export type ScriptRecord = {
  id: string;
  title: string;
  content: string;
  updated?: string;
  created?: string;
  source?: 'mapped' | 'local';
};

export type MappedHandle = {
  id: string;
  title: string;
  handle: FileSystemHandle; // FileSystemFileHandle expected
};

import { debugLog, hudLog } from '../env/logging';

const scriptsById = new Map<string, ScriptRecord>();
const mappedHandles = new Map<string, MappedHandle>();
let lastSyncFingerprint = '';
const computeFingerprint = (entries: { id: string }[]) =>
  entries
    .map((e) => String(e.id || ''))
    .sort()
    .join('|');

async function ensureReadPermission(handle: FileSystemHandle): Promise<boolean> {
  try {
    const h: any = handle as any;
    const hasQuery = typeof h?.queryPermission === 'function';
    const hasRequest = typeof h?.requestPermission === 'function';
    if (!hasQuery && !hasRequest) return true;
    const state = hasQuery ? await h.queryPermission({ mode: 'read' }) : null;
    if (state === 'granted') return true;
    if (!hasRequest) return true;
    const req = await h.requestPermission({ mode: 'read' });
    return req === 'granted';
  } catch {
    return false;
  }
}

function emitScriptsUpdated(): void {
  try {
    window.dispatchEvent(new CustomEvent('tp:scripts-updated'));
  } catch {
    // ignore
  }
}

export const ScriptStore = {
  list(): ScriptMeta[] {
    const all = Array.from(scriptsById.values());
    debugLog('[SCRIPT-STORE] list size', all.length, all.map((r) => r.id));
    return all.map((rec) => ({
      id: rec.id,
      title: rec.title,
      updated: rec.updated,
    }));
  },

  async get(id: string): Promise<ScriptRecord | null> {
    const existing = scriptsById.get(id);
    if (existing && existing.content) return existing;

    const mapped = mappedHandles.get(id);
    if (!mapped) return existing ?? null;

    try {
      const ok = await ensureReadPermission(mapped.handle);
      if (!ok) {
        hudLog('script:permission:denied', { id });
        try { (window as any).toast?.('Allow folder access to load scripts, then try Refresh.', { type: 'warning' }); } catch {}
        return existing ?? null;
      }
      const file = await (mapped.handle as any).getFile();
      const text = await readMappedFile(file);
      const rec: ScriptRecord = {
        id: mapped.id,
        title: mapped.title,
        content: text,
        source: 'mapped',
        created: existing?.created,
        updated: new Date().toISOString(),
      };
      scriptsById.set(id, rec);
      return rec;
    } catch (err) {
      try { console.warn('[scripts-store] failed to load mapped script', err); } catch {}
      return existing ?? null;
    }
  },

  save(data: { id?: string | null; title: string; content: string }): string {
    const fallbackId = data.title?.trim() || `script-${Date.now()}`;
    const id = (data.id || '').trim() || fallbackId;
    const existing = scriptsById.get(id);
    const now = new Date().toISOString();

    const rec: ScriptRecord = {
      id,
      title: data.title || existing?.title || id,
      content: data.content,
      source: existing?.source || 'local',
      created: existing?.created || now,
      updated: now,
    };

    scriptsById.set(id, rec);
    emitScriptsUpdated();
    return id;
  },

  rename(id: string, title: string): void {
    const rec = scriptsById.get(id);
    if (!rec) return;
    rec.title = title;
    rec.updated = new Date().toISOString();
    scriptsById.set(id, rec);
    emitScriptsUpdated();
  },

  remove(id: string): void {
    scriptsById.delete(id);
    mappedHandles.delete(id);
    emitScriptsUpdated();
  },

  getMappedEntries(): Array<{ id: string; title: string; handle?: FileSystemHandle }> {
    return Array.from(mappedHandles.values()).map((m) => ({
      id: m.id,
      title: m.title,
      handle: m.handle,
    }));
  },

  syncMapped(entries: { id: string; title: string; handle: FileSystemHandle }[]): void {
    const fingerprint = computeFingerprint(entries);
    if (fingerprint && fingerprint === lastSyncFingerprint) {
      debugLog('[SCRIPT-STORE] syncMapped skipped (unchanged)', { fingerprint, count: entries.length });
      return;
    }
    lastSyncFingerprint = fingerprint;
    debugLog('[SCRIPT-STORE] syncMapped entries', entries);
    mappedHandles.clear();

    for (const e of entries) {
      mappedHandles.set(e.id, { id: e.id, title: e.title, handle: e.handle });

      const existing = scriptsById.get(e.id);
      scriptsById.set(e.id, {
        id: e.id,
        title: e.title,
        content: existing?.content || '',
        created: existing?.created || new Date().toISOString(),
        updated: existing?.updated,
        source: existing?.source ?? 'mapped',
      });
    }
    const ids = Array.from(scriptsById.keys());
    debugLog('[SCRIPT-STORE] scriptsById size after sync', scriptsById.size, ids);
    hudLog('script-store:syncMapped', { size: scriptsById.size, ids });
    emitScriptsUpdated();
  },
};

async function readMappedFile(file: File): Promise<string> {
  try {
    const name = file?.name || '';
    const lower = name.toLowerCase();
    if (/\.docx$/i.test(lower)) {
      const buf = await file.arrayBuffer();
      const docText = await extractDocxText(buf);
      if (docText) return docText;
    }
    return await file.text();
  } catch (err) {
    try { console.warn('[scripts-store] readMappedFile failed', err); } catch {}
    return '';
  }
}

async function extractDocxText(buf: ArrayBuffer): Promise<string> {
  try {
    const ensure = (window as any).ensureMammoth as undefined | (() => Promise<any>);
    const mod = ensure ? await ensure() : null;
    const mammoth = (mod && (mod.mammoth || mod.default)) || (window as any).mammoth || null;
    if (!mammoth) throw new Error('mammoth not available');
    const res = await mammoth.extractRawText({ arrayBuffer: buf });
    const raw = (res && (res.value || res.text || '')) || '';
    return String(raw).replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  } catch (err) {
    try { console.warn('[scripts-store] docx parse failed', err); } catch {}
    return '';
  }
}

declare global {
  interface Window {
    Scripts?: typeof ScriptStore;
    getScriptsApi?: () => typeof ScriptStore;
  }
}

try {
  (window as any).Scripts = ScriptStore;
  (window as any).getScriptsApi = () => ScriptStore;
} catch {
  // ignore if window not available
}
