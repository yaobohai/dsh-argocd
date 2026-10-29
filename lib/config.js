import Schema from '@deepseek-ai/schemastery';
import { CREDENTIAL_REF, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS, MIN_TIMEOUT_MS, SITE_ID, } from './model.js';
/** 设置页条目 id，必须与 cordis.patch.yml 的行 id 一致。 */
export const ENTRY_ID = 'dsh-argocd';
/** 设置导航名称。配置只出现在这一页，不出现在插件页。 */
export const SETTINGS_SECTION_LABEL = 'ArgoCD连接';
const siteSchema = Schema.object({
    id: Schema.string().pattern(SITE_ID).required().description('站点标识，小写字母开头，可含数字和连字符'),
    name: Schema.string().required().description('显示名称'),
    baseUrl: Schema.string().required().description('Argo CD 根地址，例如 https://argocd.example.com'),
    username: Schema.string().required().description('登录用户名'),
    passwordRef: Schema.string().pattern(CREDENTIAL_REF).role('credential-ref').required()
        .description('密码的凭据引用名。配置只保存这个名字，不保存密码'),
    timeoutMs: Schema.number().step(1).min(MIN_TIMEOUT_MS).max(MAX_TIMEOUT_MS).default(DEFAULT_TIMEOUT_MS)
        .description('连接超时（毫秒）'),
    insecureSkipTls: Schema.boolean().default(false).description('跳过 TLS 证书校验'),
});
/**
 * 可编辑根字段标成 volatile，设置页才能写入整份站点列表。
 * 插件页不渲染这些字段：apply 里会关闭自动配置页。
 */
export const Config = Schema.object({
    sites: Schema.array(siteSchema).default([]).volatile().description('Argo CD 站点列表'),
    defaultSiteId: Schema.string().default('').volatile().description('工具未指定站点时使用的站点标识'),
});
