import assert from 'node:assert/strict'
import http from 'node:http'
import { describe, it } from 'node:test'
import { headersFor, joinUrl, request } from '../lib/http.js'

describe('地址拼接', () => {
  it('去掉重复的斜杠', () => {
    assert.equal(joinUrl('https://cd.example/', '/api/v1/session'), 'https://cd.example/api/v1/session')
    assert.equal(joinUrl('https://cd.example', 'api/v1/session'), 'https://cd.example/api/v1/session')
  })
})

describe('HTTP', () => {
  it('把请求体发给本地服务并读回状态码', async () => {
    const seen = await withServer(async (base) => {
      const result = await request(`${base}/api/v1/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'not-stored' }),
        timeoutMs: 2000,
      })
      assert.equal(result.status, 200)
      assert.equal(result.body, '{"token":"session-token"}')
    })
    assert.equal(seen.method, 'POST')
    assert.equal(seen.body.includes('not-stored'), true)
    assert.equal(seen.path, '/api/v1/session')
  })

  it('DELETE 没有请求体时仍然带 application/json', async () => {
    assert.equal(headersFor('DELETE')['Content-Type'], 'application/json')
    assert.equal(headersFor('GET')['Content-Type'], undefined)
    const seen = await withServer(async (base) => {
      const result = await request(`${base}/api/v1/applications/demo/resource`, {
        method: 'DELETE',
        timeoutMs: 2000,
      })
      assert.equal(result.status, 200)
    })
    assert.equal(seen.method, 'DELETE')
    assert.equal(seen.contentType, 'application/json')
  })
})

function withServer(run) {
  const seen = { method: '', path: '', body: '', contentType: '' }
  const server = http.createServer((req, res) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      seen.method = req.method ?? ''
      seen.path = req.url ?? ''
      seen.body = Buffer.concat(chunks).toString('utf8')
      seen.contentType = req.headers['content-type'] ?? ''
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{"token":"session-token"}')
    })
  })
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', async () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      try {
        await run(`http://127.0.0.1:${port}`)
        resolve(seen)
      } catch (error) {
        reject(error)
      } finally {
        server.close()
      }
    })
  })
}
