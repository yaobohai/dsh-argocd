export const DEFAULT_TIMEOUT_MS = 30_000;
export const MIN_TIMEOUT_MS = 1_000;
export const MAX_TIMEOUT_MS = 300_000;
export const SITE_ID = /^[a-z][a-z0-9-]{0,31}$/;
export const CREDENTIAL_REF = /^[A-Za-z_][A-Za-z0-9_]*$/;
export function passwordRefFor(siteId) {
    const body = siteId.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return `ARGOCD_${body || 'SITE'}_PASSWORD`;
}
export function isSiteId(value) {
    return SITE_ID.test(value);
}
export function isCredentialRefName(value) {
    return CREDENTIAL_REF.test(value);
}
export function normalizeSite(input) {
    if (!input)
        return undefined;
    const id = typeof input.id === 'string' ? input.id.trim() : '';
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const baseUrl = typeof input.baseUrl === 'string' ? input.baseUrl.trim().replace(/\/+$/, '') : '';
    const username = typeof input.username === 'string' ? input.username.trim() : '';
    const passwordRef = typeof input.passwordRef === 'string' ? input.passwordRef.trim() : '';
    if (!id || !name || !baseUrl || !username || !passwordRef)
        return undefined;
    if (!isSiteId(id) || !isCredentialRefName(passwordRef))
        return undefined;
    const timeout = Number(input.timeoutMs);
    const timeoutMs = Number.isFinite(timeout)
        ? Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(timeout)))
        : DEFAULT_TIMEOUT_MS;
    return {
        id,
        name,
        baseUrl,
        username,
        passwordRef,
        timeoutMs,
        insecureSkipTls: input.insecureSkipTls === true,
    };
}
export function selectSite(sites, defaultSiteId, requested) {
    const query = requested?.trim();
    if (query) {
        const found = sites.find((site) => site.id === query || site.name === query);
        if (!found) {
            const known = sites.map((site) => site.id).join('、') || '（无）';
            throw new Error(`找不到 Argo CD 站点「${query}」。已配置：${known}`);
        }
        return found;
    }
    if (defaultSiteId) {
        const found = sites.find((site) => site.id === defaultSiteId);
        if (found)
            return found;
    }
    if (sites.length === 1)
        return sites[0];
    if (sites.length === 0) {
        throw new Error('还没有 Argo CD 站点。请打开 设置 → ArgoCD连接 添加站点。');
    }
    const known = sites.map((site) => site.id).join('、');
    throw new Error(`配置了多个 Argo CD 站点，请在参数 site 中指定其中一个：${known}`);
}
