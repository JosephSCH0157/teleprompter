export type Roles = Record<string, {
    name?: string;
} | any>;
export declare function smartTag(input: string, opts?: {
    keepNames?: boolean;
    ROLES?: Roles;
}): string;
export default smartTag;
