import type { Context } from '@deepseek-ai/cordis'
import { isVolatile, type Volatile } from '@deepseek-ai/cosmokit'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { RuntimeConfig } from './config.js'
import { normalizeSite, selectSite, type ResolvedSite, type SiteRecord } from './model.js'

function readField<T>(value: unknown): T | undefined {
  if (isVolatile(value)) return value.get() as T
  return value as T | undefined
}

export function readSites(config: RuntimeConfig | Volatile<RuntimeConfig>): { sites: ResolvedSite[], defaultSiteId: string } {
  const root = isVolatile(config) ? config.get() as RuntimeConfig : config
  const raw = readField<SiteRecord[]>(root.sites) ?? []
  const sites = raw.map((item) => normalizeSite(item)).filter((item): item is ResolvedSite => item !== undefined)
  return { sites, defaultSiteId: readField<string>(root.defaultSiteId) ?? '' }
}

export async function resolvePassword(ctx: Context, site: ResolvedSite): Promise<string> {
  const credentials = ctx.credentials
  if (!credentials) {
    throw new Error('凭据服务未加载，无法读取 Argo CD 密码')
  }
  const hit = await credentials.resolve(credentialRef(site.passwordRef))
  if (!hit?.value) {
    throw new Error(`站点「${site.name}」的密码未配置。请打开 设置 → ArgoCD连接 填写密码。引用名：${site.passwordRef}`)
  }
  return hit.value
}

export { selectSite }
export type { ResolvedSite } from './model.js'
