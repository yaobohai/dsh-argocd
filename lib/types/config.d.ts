import type { Volatile } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import { type SiteRecord } from './model.js';
/** 设置页条目 id，必须与 cordis.patch.yml 的行 id 一致。 */
export declare const ENTRY_ID = "dsh-argocd";
/** 设置导航名称。配置只出现在这一页，不出现在插件页。 */
export declare const SETTINGS_SECTION_LABEL = "ArgoCD\u8FDE\u63A5";
/**
 * Loader 交给 apply 的配置。volatile 字段在热更新时原地变更，读取时要 `.get()`。
 * 密码不在这里：每个站点只保存凭据引用名。
 */
export interface RuntimeConfig {
    sites?: Volatile<SiteRecord[] | undefined> | SiteRecord[];
    defaultSiteId?: Volatile<string | undefined> | string;
}
/**
 * 可编辑根字段标成 volatile，设置页才能写入整份站点列表。
 * 插件页不渲染这些字段：apply 里会关闭自动配置页。
 */
export declare const Config: Schema<Schemastery.ObjectS<NoInfer<{
    sites: Schema<NoInfer<({
        id?: string | null | undefined;
        name?: string | null | undefined;
        baseUrl?: string | null | undefined;
        username?: string | null | undefined;
        passwordRef?: string | null | undefined;
        timeoutMs?: number | null | undefined;
        insecureSkipTls?: boolean | null | undefined;
    } & import("@deepseek-ai/cosmokit").Dict)[]>, NoInfer<Schemastery.ObjectT<NoInfer<{
        id: Schema<string, string, "defined">;
        name: Schema<string, string, "defined">;
        baseUrl: Schema<string, string, "defined">;
        username: Schema<string, string, "defined">;
        passwordRef: Schema<string, string, "defined">;
        timeoutMs: Schema<number, number, "defined">;
        insecureSkipTls: Schema<boolean, boolean, "defined">;
    }>>[]>, "volatile-defined">;
    defaultSiteId: Schema<string, string, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    sites: Schema<NoInfer<({
        id?: string | null | undefined;
        name?: string | null | undefined;
        baseUrl?: string | null | undefined;
        username?: string | null | undefined;
        passwordRef?: string | null | undefined;
        timeoutMs?: number | null | undefined;
        insecureSkipTls?: boolean | null | undefined;
    } & import("@deepseek-ai/cosmokit").Dict)[]>, NoInfer<Schemastery.ObjectT<NoInfer<{
        id: Schema<string, string, "defined">;
        name: Schema<string, string, "defined">;
        baseUrl: Schema<string, string, "defined">;
        username: Schema<string, string, "defined">;
        passwordRef: Schema<string, string, "defined">;
        timeoutMs: Schema<number, number, "defined">;
        insecureSkipTls: Schema<boolean, boolean, "defined">;
    }>>[]>, "volatile-defined">;
    defaultSiteId: Schema<string, string, "volatile-defined">;
}>>, "plain">;
