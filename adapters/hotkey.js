/* GENERATED FROM TypeScript - DO NOT EDIT. Edit src/adapters/*.ts instead. */

// src/adapters/hotkey.ts
function g() {
  return window;
}
function enable() {
  const w = g();
  if (w.__tpHotkeysImpl?.enable) return w.__tpHotkeysImpl.enable();
  if (w.hotkeys?.enable) return w.hotkeys.enable();
  if (w.__tpHotkey?.enable) return w.__tpHotkey.enable();
}
function disable() {
  const w = g();
  if (w.__tpHotkeysImpl?.disable) return w.__tpHotkeysImpl.disable();
  if (w.hotkeys?.disable) return w.hotkeys.disable();
  if (w.__tpHotkey?.disable) return w.__tpHotkey.disable();
}
var hotkey_default = { enable, disable };
export {
  hotkey_default as default,
  disable,
  enable
};
//# sourceMappingURL=hotkey.js.map
