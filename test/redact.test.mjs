import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { extractLogText, redactManifest, redactSecrets, redactText, tokenExpiryMs } from '../lib/redact.js'

describe('脱敏', () => {
  it('去掉集群凭据字段', () => {
    const cleaned = redactSecrets({
      name: 'in-cluster',
      server: 'https://kubernetes.default.svc',
      config: {
        username: 'admin',
        bearerToken: 'secret-token',
        password: 'secret-password',
        tlsClientConfig: { insecure: false, certData: 'keep-not-this' },
      },
    })
    const text = JSON.stringify(cleaned)
    assert.equal(text.includes('secret-token'), false)
    assert.equal(text.includes('secret-password'), false)
    assert.equal(text.includes('keep-not-this'), false)
    assert.equal(cleaned.name, 'in-cluster')
    assert.equal(cleaned.config.username, 'admin')
  })

  it('Secret 清单只保留键名', () => {
    const cleaned = redactManifest({
      kind: 'Secret',
      metadata: { name: 'db' },
      data: { password: 'c2VjcmV0', token: 'dG9rZW4=' },
      stringData: { note: 'plain' },
    })
    assert.deepEqual(cleaned.data, ['password', 'token'])
    assert.deepEqual(cleaned.stringData, ['note'])
    assert.equal(cleaned.dataRedacted, true)
    assert.equal(JSON.stringify(cleaned).includes('c2VjcmV0'), false)
    assert.equal(JSON.stringify(cleaned).includes('plain'), false)
  })

  it('错误文本里的密码和 token 会被替换', () => {
    assert.equal(redactText('login failed for secret-password', ['secret-password']), 'login failed for ***')
  })
})

describe('日志和 token', () => {
  it('解析 Argo CD 的 NDJSON 日志', () => {
    const raw = [
      '{"result":{"content":"hello\\n"}}',
      '{"result":{"content":"world\\n"}}',
    ].join('\n')
    assert.equal(extractLogText(raw), 'hello\nworld')
  })

  it('保留非 JSON 日志原文', () => {
    assert.equal(extractLogText('plain line'), 'plain line')
  })

  it('读取 JWT 过期时间', () => {
    const body = Buffer.from(JSON.stringify({ exp: 100 })).toString('base64url')
    assert.equal(tokenExpiryMs(`x.${body}.y`), 100_000)
    assert.equal(tokenExpiryMs('not-a-jwt'), undefined)
  })
})
