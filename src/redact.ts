const SECRET_KEYS = new Set([
  'password',
  'token',
  'bearerToken',
  'secret',
  'clientSecret',
  'awsSecretAccessKey',
  'tlsClientCertData',
  'tlsClientCertKey',
  'tlsClientKey',
  'sshPrivateKey',
  'execProviderConfig',
  'authProvider',
  'awsAuthConfig',
  'gcpAuthConfig',
  'azureAuthConfig',
])

/** 从对象树里去掉常见密钥字段。用于集群和资源响应，避免把集群凭据交给模型。 */
export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item))
  if (!value || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEYS.has(key) || /password|token|secret|privatekey|certdata|clientkey/i.test(key)) continue
    out[key] = redactSecrets(item)
  }
  return out
}

/** Secret 清单只保留键名，不返回 data / stringData。 */
export function redactManifest(manifest: unknown): unknown {
  if (!manifest || typeof manifest !== 'object') return manifest
  const record = manifest as Record<string, unknown>
  if (record.kind !== 'Secret') return redactSecrets(manifest)
  const data = record.data
  const stringData = record.stringData
  const redacted = redactSecrets(manifest) as Record<string, unknown>
  redacted.data = keyNames(data)
  redacted.stringData = keyNames(stringData)
  redacted.dataRedacted = true
  return redacted
}

export function redactText(text: string, secrets: readonly string[]): string {
  let out = text
  for (const secret of secrets) {
    if (secret.length < 4) continue
    out = out.split(secret).join('***')
  }
  return out
}

function keyNames(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.keys(value as Record<string, unknown>).sort()
}

/** Argo CD 日志接口返回 NDJSON（每行 result.content）或纯文本。 */
export function extractLogText(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  const lines = trimmed.split(/\r?\n/).filter((line) => line.length > 0)
  const parsed: string[] = []
  for (const line of lines) {
    const text = line.trim()
    if (text.startsWith('{')) {
      try {
        const obj = JSON.parse(text) as { result?: { content?: unknown }, content?: unknown }
        const content = obj.result?.content ?? obj.content
        if (typeof content === 'string') {
          parsed.push(content.replace(/\n$/, ''))
          continue
        }
      } catch {
        // 不是 JSON 时按原文保留
      }
    }
    parsed.push(line)
  }
  return parsed.join('\n')
}

export function tokenExpiryMs(token: string): number | undefined {
  const parts = token.split('.')
  if (parts.length < 2) return undefined
  try {
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as { exp?: unknown }
    if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) return undefined
    return payload.exp * 1000
  } catch {
    return undefined
  }
}
