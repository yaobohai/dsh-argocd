import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

describe('安装和配置约束', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const config = readFileSync(new URL('../src/config.ts', import.meta.url), 'utf8')
  const client = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
  const remote = readFileSync(new URL('../lib/remote.js', import.meta.url), 'utf8')
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')

  it('没有会触发安装审批的生命周期脚本', () => {
    assert.equal(pkg.scripts.prepare, undefined)
    assert.equal(pkg.scripts.postinstall, undefined)
    assert.equal(pkg.scripts.preinstall, undefined)
  })

  it('配置只保存凭据引用，不保存密码字段', () => {
    assert.match(config, /role\('credential-ref'\)/)
    assert.equal(/\bpassword\s*:/.test(config), false)
  })

  it('设置页名称是 ArgoCD连接，客户端不注册插件页配置', () => {
    assert.match(client, /ArgoCD连接/)
    assert.equal(client.includes('plugins.item'), false)
    assert.equal(client.includes('plugins.row.config'), false)
    assert.match(patch, /id: dsh-argocd/)
  })

  it('测试连接的参数名能被宿主从源码识别', () => {
    assert.match(remote, /async testConnection\(baseUrl, username, passwordRef, timeoutMs, insecureSkipTls, password, signal\)/)
  })
})
