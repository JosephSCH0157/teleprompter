// src/adapters/hotkey.ts - TS facade adapter

function g(): any { return (window as any); }

export function enable() {
  const w = g();
  if (w.__tpHotkeysImpl?.enable) return w.__tpHotkeysImpl.enable();
  if (w.hotkeys?.enable) return w.hotkeys.enable();
  if (w.__tpHotkey?.enable) return w.__tpHotkey.enable();
}

export function disable() {
  const w = g();
  if (w.__tpHotkeysImpl?.disable) return w.__tpHotkeysImpl.disable();
  if (w.hotkeys?.disable) return w.hotkeys.disable();
  if (w.__tpHotkey?.disable) return w.__tpHotkey.disable();
}

export default { enable, disable };
