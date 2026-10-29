import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { ArgocdApi } from './api.js'
import { DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS, MIN_TIMEOUT_MS } from './model.js'

/**
 * 设置页「测试连接」走这条 Remote。
 * 密码只在这一次请求里出现，响应里只有是否成功和登录用户名。
 */
export class ArgocdRemote extends TypertRemoteService {
  constructor(
    ctx: Context,
    private readonly api: ArgocdApi,
  ) {
    super(ctx, 'argocdConnections', { namespace: 'argocd' })
  }

  @Remote
  async testConnection(
    baseUrl: string,
    username: string,
    passwordRef: string,
    timeoutMs: number,
    insecureSkipTls: boolean,
    password: string | undefined,
    signal?: AbortSignal,
  ): Promise<{ ok: boolean, message: string, username?: string }> {
    const timeout = Number(timeoutMs)
    const bounded = Number.isFinite(timeout)
      ? Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(timeout)))
      : DEFAULT_TIMEOUT_MS
    const result = await this.api.testConnection({
      baseUrl: typeof baseUrl === 'string' ? baseUrl : '',
      username: typeof username === 'string' ? username : '',
      passwordRef: typeof passwordRef === 'string' ? passwordRef : '',
      timeoutMs: bounded,
      insecureSkipTls: insecureSkipTls === true,
      password: typeof password === 'string' ? password : undefined,
      signal,
    })
    if (result.ok) return { ok: true, message: `已连接到 Argo CD，登录用户 ${result.username}`, username: result.username }
    return { ok: false, message: result.message }
  }
}
