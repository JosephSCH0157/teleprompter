declare global {
  interface Window {
    App?: unknown; // tighten later
    _uploadFromFile?: (file: File) => Promise<void>;
    ensureMammoth?: () => Promise<any>;
    runSelfChecks?: any;
    normalizeSimpleTagTypos?: (text: string) => string;
    formatInlineMarkup?: (text: string) => string;
  }
}

export { };

