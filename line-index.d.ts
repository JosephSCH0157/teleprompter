// line-index.d.ts
export type LineElement = HTMLElement & { dataset: DOMStringMap & { lineIdx?: string } };
export function buildLineIndex(container: HTMLElement): Array<LineElement | null>;
