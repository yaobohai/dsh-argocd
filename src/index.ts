import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import { ArgocdApi } from './api.js'
import { Config, type RuntimeConfig } from './config.js'
import { ArgocdRemote } from './remote.js'
import { registerTools } from './tools.js'

export const name = 'dsh-argocd'
export const inject = ['tools', 'credentials'] as const

/**
 * 必须从入口模块导出 Config。Loader 用它生成设置表单；不导出时设置页会显示不可用。
 * 连接元数据由设置页「ArgoCD连接」编辑。这里关闭自动配置页，避免同一份字段出现在插件页。
 */
export { Config }

export function apply(ctx: Context, config: RuntimeConfig): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.effect(() => settingsCtx.settings.configure({ auto: false }, ctx.fiber))
  })

  const api = new ArgocdApi(ctx, config)
  new ArgocdRemote(ctx, api)
  registerTools(ctx, api)

  ctx.on('credentials/reference-updated', (ref) => {
    api.invalidate(String(ref))
  })
}
