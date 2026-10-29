import * as http from 'node:http'
import * as https from 'node:https'
import { URL } from 'node:url'

export interface HttpResult {
  status: number
  body: string
}

export interface HttpOptions {
  method?: string
  headers?: Record<string, string>
  body?: string
  signal?: AbortSignal
  insecureSkipTls?: boolean
  timeoutMs: number
}

export function joinUrl(base: string, path: string): string {
  const normalized = base.replace(/\/+$/, '')
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${normalized}${suffix}`
}

/** 不依赖额外 HTTP 库，以便安装时不触发脚本审批。 */
export function request(url: string, options: HttpOptions): Promise<HttpResult> {
  const parsed = new URL(url)
  const isHttps = parsed.protocol === 'https:'
  const lib = isHttps ? https : http
  const timeoutMs = options.timeoutMs
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(abortError())
      return
    }
    const req = lib.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: `${parsed.pathname}${parsed.search}`,
      method: options.method ?? 'GET',
      headers: options.headers,
      rejectUnauthorized: !options.insecureSkipTls,
      timeout: timeoutMs,
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf8'),
        })
      })
    })
    const onAbort = () => req.destroy(abortError())
    options.signal?.addEventListener('abort', onAbort, { once: true })
    req.on('timeout', () => {
      req.destroy(new Error(`连接超时（${timeoutMs} 毫秒）`))
    })
    req.on('error', (err) => {
      options.signal?.removeEventListener('abort', onAbort)
      reject(err)
    })
    req.on('close', () => {
      options.signal?.removeEventListener('abort', onAbort)
    })
    if (options.body) req.write(options.body)
    req.end()
  })
}

function abortError(): Error {
  const error = new Error('请求已取消')
  error.name = 'AbortError'
  return error
}
