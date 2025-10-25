export type RoleStyleFn = (key: string) => string;
export type SafeColorFn = (c: string) => string;
/**
 * Format inline markup into safe HTML. Dependencies (safeColor, roleStyle, escapeHtml)
 * are injected to keep this module pure and testable.
 */
export declare function formatInlineMarkup(text: string, deps?: {
    safeColor?: SafeColorFn;
    roleStyle?: RoleStyleFn;
    escapeHtml?: (s: string) => string;
}): string;
export default formatInlineMarkup;
