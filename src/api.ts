import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { RuntimeConfig } from './config.js'
import { joinUrl, request } from './http.js'
import { extractLogText, redactManifest, redactSecrets, redactText, tokenExpiryMs } from './redact.js'
import { readSites, resolvePassword, selectSite, type ResolvedSite } from './sites.js'

const LOG_CHAR_CAP = 256_000
const TOKEN_SKEW_MS = 30_000

interface CachedToken {
  token: string
  expiresAt: number
  fingerprint: string
}

export interface LoginResult {
  siteId: string
  siteName: string
  username: string
  loggedIn: boolean
  token: string
  expiresAt?: string
}

export class ArgocdApi {
  private readonly tokens = new Map<string, CachedToken>()

  constructor(
    private readonly ctx: Context,
    private readonly config: RuntimeConfig,
  ) {}

  sites() {
    return readSites(this.config)
  }

  pick(site?: string): ResolvedSite {
    const current = this.sites()
    return selectSite(current.sites, current.defaultSiteId, site)
  }

  invalidate(passwordRef?: string): void {
    if (!passwordRef) {
      this.tokens.clear()
      return
    }
    for (const [key, cached] of this.tokens) {
      if (cached.fingerprint.endsWith(`\n${passwordRef}`)) this.tokens.delete(key)
    }
  }

  async login(site: ResolvedSite, signal?: AbortSignal, fresh = false): Promise<LoginResult> {
    const token = await this.tokenFor(site, signal, fresh)
    const info = await this.userInfo(site, token, signal)
    const expiresAt = tokenExpiryMs(token)
    return {
      siteId: site.id,
      siteName: site.name,
      username: typeof info.username === 'string' ? info.username : site.username,
      loggedIn: info.loggedIn !== false,
      token,
      expiresAt: expiresAt === undefined ? undefined : new Date(expiresAt).toISOString(),
    }
  }

  /** 测试连接只报告能否登录，不返回 token，也不回显密码。 */
  async testConnection(input: {
    baseUrl: string
    username: string
    passwordRef: string
    timeoutMs: number
    insecureSkipTls: boolean
    password?: string
    signal?: AbortSignal
  }): Promise<{ ok: true, username: string } | { ok: false, message: string }> {
    const baseUrl = input.baseUrl.trim().replace(/\/+$/, '')
    const username = input.username.trim()
    if (!baseUrl || !username) return { ok: false, message: '请填写地址和用户名' }
    let password = input.password?.trim() ?? ''
    if (!password) {
      const credentials = this.ctx.credentials
      if (!credentials) return { ok: false, message: '凭据服务未加载' }
      if (!input.passwordRef.trim()) return { ok: false, message: '请先填写密码' }
      try {
        const hit = await credentials.resolve(credentialRef(input.passwordRef.trim()))
        password = hit?.value ?? ''
      } catch (error) {
        return { ok: false, message: messageOf(error) }
      }
    }
    if (!password) return { ok: false, message: '密码未配置。请在本页填写密码后再测试。' }
    const site: ResolvedSite = {
      id: 'test',
      name: 'test',
      baseUrl,
      username,
      passwordRef: input.passwordRef.trim() || 'ARGOCD_TEST_PASSWORD',
      timeoutMs: input.timeoutMs,
      insecureSkipTls: input.insecureSkipTls,
    }
    try {
      const session = await this.createSession(site, password, input.signal)
      const info = await this.userInfo(site, session.token, input.signal)
      return { ok: true, username: typeof info.username === 'string' ? info.username : username }
    } catch (error) {
      return { ok: false, message: redactText(messageOf(error), [password]) }
    }
  }

  async listClusters(site: ResolvedSite, signal?: AbortSignal) {
    const data = await this.json(site, 'GET', '/api/v1/clusters', { signal })
    const items = Array.isArray(data.items) ? data.items : []
    return {
      siteId: site.id,
      count: items.length,
      clusters: items.map((item) => summarizeCluster(item)),
    }
  }

  async listApplications(site: ResolvedSite, signal?: AbortSignal) {
    const data = await this.json(site, 'GET', '/api/v1/applications', { signal })
    const items = Array.isArray(data.items) ? data.items : []
    return {
      siteId: site.id,
      count: items.length,
      applications: items.map((item) => summarizeApplication(item)),
    }
  }

  async applicationSyncStatus(site: ResolvedSite, name: string, appNamespace: string | undefined, signal?: AbortSignal) {
    const app = await this.application(site, name, appNamespace, signal)
    return {
      siteId: site.id,
      ...syncOf(app),
    }
  }

  async applicationResources(site: ResolvedSite, name: string, appNamespace: string | undefined, signal?: AbortSignal) {
    const nodes = await this.resourceNodes(site, name, appNamespace, signal)
    return {
      siteId: site.id,
      application: name,
      count: nodes.length,
      resources: nodes.slice(0, 500),
      truncated: nodes.length > 500,
    }
  }

  async resourceSyncStatus(site: ResolvedSite, name: string, appNamespace: string | undefined, signal?: AbortSignal) {
    const data = await this.json(site, 'GET', resourcePath(name, '/managed-resources', appNamespace), { signal })
    const items = Array.isArray(data.items) ? data.items : []
    return {
      siteId: site.id,
      application: name,
      count: items.length,
      resources: items.slice(0, 500).map((item) => {
        const record = objectOf(item)
        return {
          group: stringOf(record.group),
          version: stringOf(record.version),
          kind: stringOf(record.kind),
          namespace: stringOf(record.namespace),
          name: stringOf(record.name),
          sync: syncCode(record),
        }
      }),
      truncated: items.length > 500,
    }
  }

  async describeResource(site: ResolvedSite, query: ResourceQuery, signal?: AbortSignal) {
    const data = await this.json(site, 'GET', resourceQueryPath(query), { signal })
    const manifest = parseManifest(data.manifest)
    return {
      siteId: site.id,
      application: query.application,
      resource: {
        group: query.group ?? '',
        version: query.version,
        kind: query.kind,
        namespace: query.namespace,
        name: query.name,
      },
      manifest: redactManifest(manifest),
    }
  }

  async resourceEvents(site: ResolvedSite, query: EventQuery, signal?: AbortSignal) {
    const params = new URLSearchParams()
    if (query.appNamespace) params.set('appNamespace', query.appNamespace)
    if (query.namespace) params.set('resourceNamespace', query.namespace)
    if (query.name) params.set('resourceName', query.name)
    if (query.uid) params.set('resourceUID', query.uid)
    const suffix = params.size ? `?${params}` : ''
    const data = await this.json(site, 'GET', `/api/v1/applications/${encodeURIComponent(query.application)}/events${suffix}`, { signal })
    const items = Array.isArray(data.items) ? data.items : []
    return {
      siteId: site.id,
      application: query.application,
      count: items.length,
      events: items.slice(0, 100).map((item) => summarizeEvent(item)),
      truncated: items.length > 100,
    }
  }

  async syncEvents(site: ResolvedSite, name: string, appNamespace: string | undefined, signal?: AbortSignal) {
    const app = await this.application(site, name, appNamespace, signal)
    const status = objectOf(app.status)
    const history = Array.isArray(status.history) ? status.history : []
    return redactSecrets({
      siteId: site.id,
      application: name,
      sync: objectOf(status.sync),
      health: objectOf(status.health),
      conditions: Array.isArray(status.conditions) ? status.conditions : [],
      operationState: status.operationState ?? null,
      history: history.slice(-20),
    })
  }

  async pods(site: ResolvedSite, name: string, appNamespace: string | undefined, signal?: AbortSignal) {
    const nodes = await this.resourceNodes(site, name, appNamespace, signal)
    const podNodes = nodes.filter((node) => node.kind === 'Pod')
    const pods = []
    for (const node of podNodes) {
      const detail = await this.tryManifest(site, {
        application: name,
        appNamespace,
        namespace: node.namespace,
        name: node.name,
        version: node.version || 'v1',
        kind: 'Pod',
        group: node.group,
      }, signal)
      pods.push(mergePod(node, detail))
    }
    return { siteId: site.id, application: name, count: pods.length, pods }
  }

  async listPods(site: ResolvedSite, name: string, appNamespace: string | undefined, signal?: AbortSignal) {
    const nodes = await this.resourceNodes(site, name, appNamespace, signal)
    const pods = nodes.filter((node) => node.kind === 'Pod').map((node) => ({
      name: node.name,
      namespace: node.namespace,
      health: node.health,
      createdAt: node.createdAt,
    }))
    return { siteId: site.id, application: name, count: pods.length, pods }
  }

  async podLogs(site: ResolvedSite, options: {
    application: string
    namespace: string
    podName: string
    container?: string
    tailLines: number
    previous?: boolean
    appNamespace?: string
    signal?: AbortSignal
  }) {
    const params = new URLSearchParams({
      namespace: options.namespace,
      podName: options.podName,
      tailLines: String(options.tailLines),
      follow: 'false',
    })
    if (options.container) params.set('container', options.container)
    if (options.previous) params.set('previous', 'true')
    if (options.appNamespace) params.set('appNamespace', options.appNamespace)
    const path = `/api/v1/applications/${encodeURIComponent(options.application)}/logs?${params}`
    const raw = await this.text(site, 'GET', path, { signal: options.signal })
    const logs = extractLogText(raw)
    return {
      siteId: site.id,
      application: options.application,
      namespace: options.namespace,
      podName: options.podName,
      container: options.container,
      tailLines: options.tailLines,
      truncated: logs.length > LOG_CHAR_CAP,
      logs: logs.slice(0, LOG_CHAR_CAP),
    }
  }

  async syncApplication(site: ResolvedSite, options: {
    application: string
    appNamespace?: string
    revision?: string
    prune?: boolean
    dryRun?: boolean
    signal?: AbortSignal
  }) {
    const params = new URLSearchParams()
    if (options.appNamespace) params.set('appNamespace', options.appNamespace)
    const suffix = params.size ? `?${params}` : ''
    const body: Record<string, unknown> = {
      prune: options.prune === true,
      dryRun: options.dryRun === true,
      strategy: { hook: {} },
    }
    if (options.revision) body.revision = options.revision
    const data = await this.json(site, 'POST', `/api/v1/applications/${encodeURIComponent(options.application)}/sync${suffix}`, {
      body,
      signal: options.signal,
    })
    return { siteId: site.id, ...syncOf(data) }
  }

  async syncAll(site: ResolvedSite, options: { prune?: boolean, dryRun?: boolean, signal?: AbortSignal }) {
    const listed = await this.listApplications(site, options.signal)
    const results = []
    for (const app of listed.applications) {
      if (options.signal?.aborted) break
      try {
        const synced = await this.syncApplication(site, {
          application: app.name,
          appNamespace: app.namespace,
          prune: options.prune,
          dryRun: options.dryRun,
          signal: options.signal,
        })
        results.push({ application: app.name, ok: true, sync: synced.sync, health: synced.health })
      } catch (error) {
        results.push({ application: app.name, ok: false, message: messageOf(error) })
      }
    }
    return {
      siteId: site.id,
      total: listed.count,
      succeeded: results.filter((item) => item.ok).length,
      failed: results.filter((item) => !item.ok).length,
      results,
    }
  }

  async deleteResource(site: ResolvedSite, query: ResourceQuery & { force?: boolean, orphan?: boolean }, signal?: AbortSignal) {
    const params = new URLSearchParams({
      namespace: query.namespace,
      resourceName: query.name,
      version: query.version,
      kind: query.kind,
      group: query.group ?? '',
    })
    if (query.appNamespace) params.set('appNamespace', query.appNamespace)
    if (query.force) params.set('force', 'true')
    if (query.orphan) params.set('orphan', 'true')
    await this.text(site, 'DELETE', `/api/v1/applications/${encodeURIComponent(query.application)}/resource?${params}`, { signal })
    return {
      siteId: site.id,
      application: query.application,
      deleted: {
        group: query.group ?? '',
        version: query.version,
        kind: query.kind,
        namespace: query.namespace,
        name: query.name,
      },
    }
  }

  private async application(site: ResolvedSite, name: string, appNamespace: string | undefined, signal?: AbortSignal) {
    const params = new URLSearchParams()
    if (appNamespace) params.set('appNamespace', appNamespace)
    const suffix = params.size ? `?${params}` : ''
    return this.json(site, 'GET', `/api/v1/applications/${encodeURIComponent(name)}${suffix}`, { signal })
  }

  private async resourceNodes(site: ResolvedSite, name: string, appNamespace: string | undefined, signal?: AbortSignal) {
    const tree = await this.json(site, 'GET', resourcePath(name, '/resource-tree', appNamespace), { signal })
    const nodes = Array.isArray(tree.nodes) ? tree.nodes : []
    return nodes.map((node) => summarizeNode(node))
  }

  private async tryManifest(site: ResolvedSite, query: ResourceQuery, signal?: AbortSignal): Promise<unknown> {
    try {
      const data = await this.json(site, 'GET', resourceQueryPath(query), { signal })
      return parseManifest(data.manifest)
    } catch {
      return undefined
    }
  }

  private async tokenFor(site: ResolvedSite, signal: AbortSignal | undefined, fresh: boolean): Promise<string> {
    const fingerprint = `${site.baseUrl}\n${site.username}\n${site.passwordRef}`
    const cached = this.tokens.get(site.id)
    if (!fresh && cached && cached.fingerprint === fingerprint && cached.expiresAt - TOKEN_SKEW_MS > Date.now()) {
      return cached.token
    }
    const password = await resolvePassword(this.ctx, site)
    try {
      const session = await this.createSession(site, password, signal)
      const expiresAt = tokenExpiryMs(session.token) ?? Date.now() + 10 * 60_000
      this.tokens.set(site.id, { token: session.token, expiresAt, fingerprint })
      return session.token
    } catch (error) {
      throw new Error(redactText(messageOf(error), [password]))
    }
  }

  private async createSession(site: ResolvedSite, password: string, signal?: AbortSignal): Promise<{ token: string }> {
    const data = await this.json(site, 'POST', '/api/v1/session', {
      body: { username: site.username, password },
      auth: false,
      password,
      signal,
    })
    const token = data.token
    if (typeof token !== 'string' || !token) throw new Error('Argo CD 登录响应没有 token')
    return { token }
  }

  private async userInfo(site: ResolvedSite, token: string, signal?: AbortSignal) {
    return this.json(site, 'GET', '/api/v1/session/userinfo', { token, signal })
  }

  private async json(site: ResolvedSite, method: string, path: string, options: CallOptions = {}): Promise<Record<string, any>> {
    const text = await this.text(site, method, path, options)
    if (!text) return {}
    try {
      const parsed: unknown = JSON.parse(text)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { value: parsed }
      return parsed as Record<string, any>
    } catch (error) {
      throw new Error(`Argo CD 响应不是合法 JSON（${method} ${path}）：${messageOf(error)}`)
    }
  }

  private async text(site: ResolvedSite, method: string, path: string, options: CallOptions = {}): Promise<string> {
    const token = options.auth === false ? undefined : (options.token ?? await this.tokenFor(site, options.signal, false))
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'
    if (token) headers.Authorization = `Bearer ${token}`
    let res
    try {
      res = await request(joinUrl(site.baseUrl, path), {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: options.signal,
        insecureSkipTls: site.insecureSkipTls,
        timeoutMs: site.timeoutMs,
      })
    } catch (error) {
      throw new Error(redactText(messageOf(error), secretList(options.password, token)))
    }
    if (res.status === 401 && options.auth !== false && options.retried !== true) {
      this.tokens.delete(site.id)
      return this.text(site, method, path, { ...options, token: undefined, retried: true })
    }
    if (res.status >= 400) {
      let detail = res.body.slice(0, 800)
      try {
        const parsed = JSON.parse(res.body) as { error?: unknown, message?: unknown }
        detail = stringOf(parsed.message) || stringOf(parsed.error) || detail
      } catch {
        // 保留原文片段
      }
      throw new Error(redactText(`Argo CD ${method} ${path} 返回 HTTP ${res.status}：${detail}`, secretList(options.password, token)))
    }
    return res.body
  }
}

interface CallOptions {
  body?: unknown
  signal?: AbortSignal
  auth?: boolean
  token?: string
  password?: string
  retried?: boolean
}

interface ResourceQuery {
  application: string
  appNamespace?: string
  namespace: string
  name: string
  version: string
  kind: string
  group?: string
}

interface EventQuery {
  application: string
  appNamespace?: string
  namespace?: string
  name?: string
  uid?: string
}

function resourcePath(name: string, suffix: string, appNamespace?: string): string {
  const params = new URLSearchParams()
  if (appNamespace) params.set('appNamespace', appNamespace)
  const query = params.size ? `?${params}` : ''
  return `/api/v1/applications/${encodeURIComponent(name)}${suffix}${query}`
}

function resourceQueryPath(query: ResourceQuery): string {
  const params = new URLSearchParams({
    namespace: query.namespace,
    resourceName: query.name,
    version: query.version,
    kind: query.kind,
    group: query.group ?? '',
  })
  if (query.appNamespace) params.set('appNamespace', query.appNamespace)
  return `/api/v1/applications/${encodeURIComponent(query.application)}/resource?${params}`
}

function summarizeCluster(item: unknown) {
  const record = objectOf(item)
  const info = objectOf(record.info)
  const connection = objectOf(record.connectionState)
  return {
    name: stringOf(record.name),
    server: stringOf(record.server),
    namespaces: record.namespaces,
    connectionState: {
      status: stringOf(connection.status) || stringOf(info.connectionState),
      message: stringOf(connection.message),
    },
    serverVersion: stringOf(record.serverVersion) || stringOf(info.serverVersion),
    applicationsCount: info.applicationsCount,
    cacheInfo: info.cacheInfo,
  }
}

function summarizeApplication(item: unknown) {
  const record = objectOf(item)
  const metadata = objectOf(record.metadata)
  const spec = objectOf(record.spec)
  const status = objectOf(record.status)
  const source = objectOf(spec.source)
  const destination = objectOf(spec.destination)
  const sync = objectOf(status.sync)
  const health = objectOf(status.health)
  return {
    name: stringOf(metadata.name),
    namespace: stringOf(metadata.namespace),
    project: stringOf(spec.project),
    repoURL: stringOf(source.repoURL),
    path: stringOf(source.path) || stringOf(source.chart),
    targetRevision: stringOf(source.targetRevision),
    destination: {
      server: stringOf(destination.server),
      namespace: stringOf(destination.namespace),
      name: stringOf(destination.name),
    },
    sync: stringOf(sync.status) || 'Unknown',
    revision: stringOf(sync.revision),
    health: stringOf(health.status) || 'Unknown',
  }
}

function syncOf(app: Record<string, any>) {
  const metadata = objectOf(app.metadata)
  const status = objectOf(app.status)
  const sync = objectOf(status.sync)
  const health = objectOf(status.health)
  const operation = objectOf(status.operationState)
  return {
    application: stringOf(metadata.name),
    namespace: stringOf(metadata.namespace),
    sync: stringOf(sync.status) || 'Unknown',
    revision: stringOf(sync.revision),
    health: stringOf(health.status) || 'Unknown',
    operationPhase: stringOf(operation.phase),
    operationMessage: stringOf(operation.message),
  }
}

function summarizeNode(node: unknown) {
  const record = objectOf(node)
  const health = objectOf(record.health)
  return {
    group: stringOf(record.group),
    version: stringOf(record.version),
    kind: stringOf(record.kind),
    namespace: stringOf(record.namespace),
    name: stringOf(record.name),
    uid: stringOf(record.uid),
    health: stringOf(health.status) || 'Unknown',
    createdAt: stringOf(record.createdAt),
  }
}

function summarizeEvent(item: unknown) {
  const record = objectOf(item)
  const metadata = objectOf(record.metadata)
  const involved = objectOf(record.involvedObject)
  return {
    type: stringOf(record.type),
    reason: stringOf(record.reason),
    message: stringOf(record.message),
    count: record.count,
    firstTimestamp: stringOf(record.firstTimestamp) || stringOf(metadata.creationTimestamp),
    lastTimestamp: stringOf(record.lastTimestamp),
    involvedObject: {
      kind: stringOf(involved.kind),
      namespace: stringOf(involved.namespace),
      name: stringOf(involved.name),
    },
  }
}

function mergePod(node: { name: string, namespace: string, health: string }, manifest: unknown) {
  const root = objectOf(manifest)
  const spec = objectOf(root.spec)
  const status = objectOf(root.status)
  const specs = Array.isArray(spec.containers) ? spec.containers : []
  const statuses = Array.isArray(status.containerStatuses) ? status.containerStatuses : []
  const containers = specs.map((item) => {
    const container = objectOf(item)
    const name = stringOf(container.name)
    const live = statuses.map(objectOf).find((entry) => stringOf(entry.name) === name)
    const resources = objectOf(container.resources)
    return {
      name,
      image: stringOf(container.image),
      ready: typeof live?.ready === 'boolean' ? live.ready : undefined,
      restartCount: typeof live?.restartCount === 'number' ? live.restartCount : undefined,
      requests: redactSecrets(resources.requests),
      limits: redactSecrets(resources.limits),
    }
  })
  const ready = containers.filter((item) => item.ready).length
  return {
    name: node.name,
    namespace: node.namespace,
    health: node.health,
    phase: stringOf(status.phase),
    nodeName: stringOf(spec.nodeName),
    startTime: stringOf(status.startTime),
    ready: containers.length ? `${ready}/${containers.length}` : undefined,
    restarts: containers.reduce((sum, item) => sum + (item.restartCount ?? 0), 0),
    containers,
  }
}

function parseManifest(value: unknown): unknown {
  if (typeof value !== 'string' || !value) return undefined
  try {
    return JSON.parse(value) as unknown
  } catch {
    return { raw: value.slice(0, 8000), parseError: true }
  }
}

function objectOf(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, any>
}

function stringOf(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function syncCode(item: Record<string, any>): string {
  if (typeof item.status === 'string' && item.status) return item.status
  const nested = objectOf(item.status)
  if (typeof nested.status === 'string' && nested.status) return nested.status
  return 'Unknown'
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function secretList(password?: string, token?: string): string[] {
  return [password, token].filter((item): item is string => typeof item === 'string' && item.length > 0)
}
