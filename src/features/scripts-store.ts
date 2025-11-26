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

const scriptsById = new Map<string, ScriptRecord>();
const mappedHandles = new Map<string, MappedHandle>();

export const ScriptStore = {
  list(): ScriptMeta[] {
    return Array.from(scriptsById.values()).map((rec) => ({
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
    return id;
  },

  rename(id: string, title: string): void {
    const rec = scriptsById.get(id);
    if (!rec) return;
    rec.title = title;
    rec.updated = new Date().toISOString();
    scriptsById.set(id, rec);
  },

  remove(id: string): void {
    scriptsById.delete(id);
    mappedHandles.delete(id);
  },

  syncMapped(entries: { id: string; title: string; handle: FileSystemHandle }[]): void {
    mappedHandles.clear();

    for (const e of entries) {
      mappedHandles.set(e.id, { id: e.id, title: e.title, handle: e.handle });

      const existing = scriptsById.get(e.id);
      scriptsById.set(e.id, {
        id: e.id,
        title: e.title,
        content: existing?.content || '',
        created: existing?.created,
        updated: existing?.updated,
        source: existing?.source || 'mapped',
      });
    }
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
