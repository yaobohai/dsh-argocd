export declare const DEFAULT_TIMEOUT_MS = 15000;
export declare const MIN_TIMEOUT_MS = 1000;
export declare const MAX_TIMEOUT_MS = 300000;
export declare const SITE_ID: RegExp;
export declare const CREDENTIAL_REF: RegExp;
export interface SiteRecord {
    id: string;
    name: string;
    baseUrl: string;
    username: string;
    passwordRef: string;
    timeoutMs: number;
    insecureSkipTls: boolean;
}
export interface ResolvedSite {
    id: string;
    name: string;
    baseUrl: string;
    username: string;
    passwordRef: string;
    timeoutMs: number;
    insecureSkipTls: boolean;
}
export declare function passwordRefFor(siteId: string): string;
export declare function isSiteId(value: string): boolean;
export declare function isCredentialRefName(value: string): boolean;
export declare function normalizeSite(input: Partial<SiteRecord> | undefined): ResolvedSite | undefined;
export declare function selectSite(sites: readonly ResolvedSite[], defaultSiteId: string, requested?: string): ResolvedSite;
