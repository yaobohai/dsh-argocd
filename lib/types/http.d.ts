export interface HttpResult {
    status: number;
    body: string;
}
export interface HttpOptions {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
    insecureSkipTls?: boolean;
    timeoutMs: number;
}
export declare function joinUrl(base: string, path: string): string;
/** 不依赖额外 HTTP 库，以便安装时不触发脚本审批。 */
export declare function request(url: string, options: HttpOptions): Promise<HttpResult>;
