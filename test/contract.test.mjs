import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

describe('安装和配置约束', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const config = readFileSync(new URL('../src/config.ts', import.meta.url), 'utf8')
  const client = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
  const remote = readFileSync(new URL('../lib/remote.js', import.meta.url), 'utf8')
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')

  it('兼容 DSH 0.2.1-rc.2 和 0.2.1-rc.3', () => {
    assert.equal(pkg.engines.dsh, '>=0.2.1-rc.2 <0.3.0')
    for (const [name, range] of Object.entries(pkg.peerDependencies)) {
      if (!name.startsWith('@deepseek-ai/dsh')) continue
      assert.equal(range, '>=0.2.1-rc.2 <0.3.0')
    }
  })

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

  it('客户端声明 remote，保存站点时才能进入凭据命名空间', () => {
    const declared = client.match(/const inject = (\[[^\]]*\])/)
    assert.ok(declared)
    const names = JSON.parse(declared[1].replaceAll("'", '"'))
    assert.equal(names.includes('remote'), true)
    assert.equal(names.includes('remote.credentials'), true)
  })

  it('订阅配置表单时保留 this，避免读取 store 失败', () => {
    assert.equal(/useSyncExternalStore\(\s*form\.subscribe/.test(client), false)
    assert.match(client, /form\.subscribe\(listener\)/)
    assert.match(client, /form\.getSnapshot\(\)/)
  })

  it('测试连接的参数名能被宿主从源码识别', () => {
    assert.match(remote, /async testConnection\(baseUrl, username, passwordRef, timeoutMs, insecureSkipTls, password, signal\)/)
  })
})
