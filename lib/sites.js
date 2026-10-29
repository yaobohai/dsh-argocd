import { isVolatile } from '@deepseek-ai/cosmokit';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { normalizeSite, selectSite } from './model.js';
function readField(value) {
    if (isVolatile(value))
        return value.get();
    return value;
}
export function readSites(config) {
    const root = isVolatile(config) ? config.get() : config;
    const raw = readField(root.sites) ?? [];
    const sites = raw.map((item) => normalizeSite(item)).filter((item) => item !== undefined);
    return { sites, defaultSiteId: readField(root.defaultSiteId) ?? '' };
}
export async function resolvePassword(ctx, site) {
    const credentials = ctx.credentials;
    if (!credentials) {
        throw new Error('凭据服务未加载，无法读取 Argo CD 密码');
    }
    const hit = await credentials.resolve(credentialRef(site.passwordRef));
    if (!hit?.value) {
        throw new Error(`站点「${site.name}」的密码未配置。请打开 设置 → ArgoCD连接 填写密码。引用名：${site.passwordRef}`);
    }
    return hit.value;
}
export { selectSite };
