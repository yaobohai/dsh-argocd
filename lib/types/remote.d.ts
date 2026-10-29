import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { ArgocdApi } from './api.js';
/**
 * 设置页「测试连接」走这条 Remote。
 * 密码只在这一次请求里出现，响应里只有是否成功和登录用户名。
 */
export declare class ArgocdRemote extends TypertRemoteService {
    private readonly api;
    constructor(ctx: Context, api: ArgocdApi);
    testConnection(baseUrl: string, username: string, passwordRef: string, timeoutMs: number, insecureSkipTls: boolean, password: string | undefined, signal?: AbortSignal): Promise<{
        ok: boolean;
        message: string;
        username?: string;
    }>;
}
