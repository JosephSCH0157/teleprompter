export const __TP_BOOT_TRACE: Array<{ ts: number; tag: string; data?: any }> = [];

export function __tpBootPush(tag: string, data?: any) {
  try { __TP_BOOT_TRACE.push({ ts: Date.now(), tag, data }); } catch {}
}

export {};
