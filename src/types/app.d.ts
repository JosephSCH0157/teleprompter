// Minimal facade types for window/App that TS modules can reference
interface Window {
  editor?: HTMLTextAreaElement | { value: string };
  renderScript?: (txt?: string) => void;
  normalizeToStandard?: () => void;
  fallbackNormalize?: () => void;
  setStatus?: (txt: string) => void;
  err?: (e: any) => void;
  _uploadFromFile?: (file: File) => Promise<void>;
  runSelfChecks?: () => Array<{ name: string; pass: boolean; info?: string }>;
}

declare var window: Window;
