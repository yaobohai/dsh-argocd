import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ParameterSchemaSpec } from '@deepseek-ai/dsh-tools'
import type { ArgocdApi } from './api.js'

const output = {
  schema: { type: 'object' as const, additionalProperties: true as const },
  render(_args: unknown, value: unknown) {
    return [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }]
  },
}

const siteParam = {
  type: 'string' as const,
  description: '站点 id 或名称。只配置了一个站点，或已设置默认站点时可以省略',
}

const appParam = {
  type: 'string' as const,
  description: 'Application 名称',
  required: true as const,
}

const appNamespaceParam = {
  type: 'string' as const,
  description: 'Application 所在命名空间。省略时使用 Argo CD 默认值',
}

export function registerTools(ctx: Context, api: ArgocdApi): void {
  const text = (name: string, description: string, parameters: ParameterSchemaSpec, run: (args: Record<string, any>, signal: AbortSignal) => Promise<unknown>, mutating = false) => {
    ctx.tools.register(defineTool({
      name,
      description,
      parameters,
      output,
      timeoutMs: mutating ? 900_000 : 300_000,
      isConcurrencySafe: () => !mutating,
      async execute(args, exec) {
        try {
          const value = await run(args as Record<string, any>, exec.signal)
          const json: unknown = JSON.parse(JSON.stringify(value ?? {}))
          if (!json || typeof json !== 'object' || Array.isArray(json)) return { value: json } as any
          return json as any
        } catch (error) {
          return { ok: false, message: error instanceof Error ? error.message : String(error) }
        }
      },
    }))
  }

  text('argocd_login', '使用已保存的用户名和凭据引用登录指定 Argo CD 站点，并返回会话 token。密码不会出现在参数或结果里。', {
    site: siteParam,
  }, async (args, signal) => {
    const site = api.pick(args.site)
    return api.login(site, signal, true)
  })

  text('argocd_get_token', '获取指定 Argo CD 站点的会话 token。未过期的会话会复用，否则用已保存的密码重新登录。', {
    site: siteParam,
  }, async (args, signal) => {
    const site = api.pick(args.site)
    return api.login(site, signal, false)
  })

  text('argocd_list_clusters', '获取 Argo CD 已知集群的名称、地址、连接状态和版本。不返回集群凭据。', {
    site: siteParam,
  }, async (args, signal) => api.listClusters(api.pick(args.site), signal))

  text('argocd_list_applications', '获取 Argo CD Application 列表，包含健康状态和同步状态。', {
    site: siteParam,
  }, async (args, signal) => api.listApplications(api.pick(args.site), signal))

  text('argocd_list_application_sync', '获取全部 Application 的资源同步状态和健康状态。', {
    site: siteParam,
  }, async (args, signal) => {
    const listed = await api.listApplications(api.pick(args.site), signal)
    return {
      siteId: listed.siteId,
      count: listed.count,
      applications: listed.applications.map((app) => ({
        name: app.name,
        namespace: app.namespace,
        sync: app.sync,
        revision: app.revision,
        health: app.health,
      })),
    }
  })

  text('argocd_get_application_resources', '获取指定 Application 的资源树：种类、名称、命名空间和健康状态。', {
    site: siteParam,
    application: appParam,
    appNamespace: appNamespaceParam,
  }, async (args, signal) => api.applicationResources(api.pick(args.site), args.application, args.appNamespace, signal))

  text('argocd_get_application_sync', '获取指定 Application 的同步状态、修订版本和最近一次同步阶段。', {
    site: siteParam,
    application: appParam,
    appNamespace: appNamespaceParam,
  }, async (args, signal) => api.applicationSyncStatus(api.pick(args.site), args.application, args.appNamespace, signal))

  text('argocd_get_resource_sync', '获取指定 Application 下每个资源的同步状态。', {
    site: siteParam,
    application: appParam,
    appNamespace: appNamespaceParam,
  }, async (args, signal) => api.resourceSyncStatus(api.pick(args.site), args.application, args.appNamespace, signal))

  text('argocd_describe_resource', '获取指定 Application 下一个资源的描述（实时清单）。Secret 只返回键名，不返回内容。', {
    site: siteParam,
    application: appParam,
    appNamespace: appNamespaceParam,
    namespace: { type: 'string', description: '资源命名空间', required: true },
    name: { type: 'string', description: '资源名称', required: true },
    kind: { type: 'string', description: '资源种类，例如 Pod、Deployment、Service', required: true },
    version: { type: 'string', description: '资源版本，例如 v1 或 v1beta1。省略时按 v1', },
    group: { type: 'string', description: 'API 组。核心资源留空' },
  }, async (args, signal) => api.describeResource(api.pick(args.site), {
    application: args.application,
    appNamespace: args.appNamespace,
    namespace: args.namespace,
    name: args.name,
    kind: args.kind,
    version: args.version || 'v1',
    group: args.group,
  }, signal))

  text('argocd_list_resource_events', '获取指定 Application 下一个资源的 Kubernetes 事件。', {
    site: siteParam,
    application: appParam,
    appNamespace: appNamespaceParam,
    namespace: { type: 'string', description: '资源命名空间' },
    name: { type: 'string', description: '资源名称' },
    uid: { type: 'string', description: '资源 UID。已知时填写，可缩小事件范围' },
  }, async (args, signal) => api.resourceEvents(api.pick(args.site), {
    application: args.application,
    appNamespace: args.appNamespace,
    namespace: args.namespace,
    name: args.name,
    uid: args.uid,
  }, signal))

  text('argocd_list_sync_events', '获取指定 Application 的同步事件：当前同步操作、条件和最近的同步历史。', {
    site: siteParam,
    application: appParam,
    appNamespace: appNamespaceParam,
  }, async (args, signal) => api.syncEvents(api.pick(args.site), args.application, args.appNamespace, signal))

  text('argocd_get_application_pods', '获取指定 Application 的 Pod 资源信息，包括阶段、就绪、重启次数、镜像以及 requests/limits。', {
    site: siteParam,
    application: appParam,
    appNamespace: appNamespaceParam,
  }, async (args, signal) => api.pods(api.pick(args.site), args.application, args.appNamespace, signal), false)

  text('argocd_list_pods', '获取指定 Application 的 Pod 列表（名称、命名空间、健康状态）。', {
    site: siteParam,
    application: appParam,
    appNamespace: appNamespaceParam,
  }, async (args, signal) => api.listPods(api.pick(args.site), args.application, args.appNamespace, signal))

  text('argocd_get_pod_logs', '获取指定 Application 中某个 Pod 的日志。默认返回最近 200 行，不跟随流。', {
    site: siteParam,
    application: appParam,
    appNamespace: appNamespaceParam,
    namespace: { type: 'string', description: 'Pod 命名空间', required: true },
    podName: { type: 'string', description: 'Pod 名称', required: true },
    container: { type: 'string', description: '容器名。Pod 只有一个容器时可以省略' },
    tailLines: { type: 'integer', description: '返回的行数，1 到 2000，默认 200' },
    previous: { type: 'boolean', description: '为 true 时读取上一个已退出容器的日志' },
  }, async (args, signal) => {
    const tail = Number(args.tailLines)
    const tailLines = Number.isFinite(tail) ? Math.min(2000, Math.max(1, Math.trunc(tail))) : 200
    return api.podLogs(api.pick(args.site), {
      application: args.application,
      appNamespace: args.appNamespace,
      namespace: args.namespace,
      podName: args.podName,
      container: args.container,
      tailLines,
      previous: args.previous === true,
      signal,
    })
  })

  text('argocd_sync_all', '同步该站点上的全部 Application。prune 为 true 时会删除 Git 中已不存在的资源。', {
    site: siteParam,
    prune: { type: 'boolean', description: '是否修剪 Git 中已删除的资源，默认 false' },
    dryRun: { type: 'boolean', description: '只预演，不真正改集群，默认 false' },
  }, async (args, signal) => api.syncAll(api.pick(args.site), {
    prune: args.prune === true,
    dryRun: args.dryRun === true,
    signal,
  }), true)

  text('argocd_sync_application', '同步指定 Application 到目标修订版本。', {
    site: siteParam,
    application: appParam,
    appNamespace: appNamespaceParam,
    revision: { type: 'string', description: '目标修订。省略时使用 Application 自己的 targetRevision' },
    prune: { type: 'boolean', description: '是否修剪 Git 中已删除的资源，默认 false' },
    dryRun: { type: 'boolean', description: '只预演，不真正改集群，默认 false' },
  }, async (args, signal) => api.syncApplication(api.pick(args.site), {
    application: args.application,
    appNamespace: args.appNamespace,
    revision: args.revision,
    prune: args.prune === true,
    dryRun: args.dryRun === true,
    signal,
  }), true)

  text('argocd_delete_resource', '删除指定 Application 管理的一个资源。这会作用到集群里的该对象，不会删除 Application 本身，除非 kind 就是那个 Application。', {
    site: siteParam,
    application: appParam,
    appNamespace: appNamespaceParam,
    namespace: { type: 'string', description: '资源命名空间', required: true },
    name: { type: 'string', description: '资源名称', required: true },
    kind: { type: 'string', description: '资源种类', required: true },
    version: { type: 'string', description: '资源版本，省略时按 v1' },
    group: { type: 'string', description: 'API 组。核心资源留空' },
    force: { type: 'boolean', description: '是否强制删除，默认 false' },
    orphan: { type: 'boolean', description: '是否只从 Argo CD 解除跟踪、保留集群对象，默认 false' },
  }, async (args, signal) => api.deleteResource(api.pick(args.site), {
    application: args.application,
    appNamespace: args.appNamespace,
    namespace: args.namespace,
    name: args.name,
    kind: args.kind,
    version: args.version || 'v1',
    group: args.group,
    force: args.force === true,
    orphan: args.orphan === true,
  }, signal), true)
}
