import { getMappedFolder, refreshMappedFolder } from './mapped-folder';

function safeFilename(title: string): string {
  const t = (title || '').trim() || 'Untitled';
  const cleaned = t.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim() || 'Untitled';
  return cleaned.toLowerCase().endsWith('.txt') ? cleaned : `${cleaned}.txt`;
}

export async function saveToMappedFolder(
  title: string,
  text: string,
): Promise<{ ok: boolean; name?: string; reason?: string }> {
  const dir = getMappedFolder();
  if (!dir) return { ok: false, reason: 'No folder mapped' };

  const name = safeFilename(title);
  try {
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await (fh as any).createWritable();
    await w.write(text);
    await w.close();
    refreshMappedFolder();
    return { ok: true, name };
  } catch (e: any) {
    return { ok: false, reason: e?.message || String(e) };
  }
}
