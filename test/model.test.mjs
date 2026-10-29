import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isSiteId, normalizeSite, passwordRefFor, selectSite } from '../lib/model.js'

describe('站点标识和凭据引用', () => {
  it('由站点 id 派生密码引用名', () => {
    assert.equal(passwordRefFor('prod-a'), 'ARGOCD_PROD_A_PASSWORD')
    assert.equal(passwordRefFor('a'), 'ARGOCD_A_PASSWORD')
  })

  it('只接受小写站点 id', () => {
    assert.equal(isSiteId('prod-1'), true)
    assert.equal(isSiteId('Prod'), false)
    assert.equal(isSiteId('a'.repeat(32)), true)
    assert.equal(isSiteId('a'.repeat(33)), false)
  })
})

describe('选择站点', () => {
  const sites = [
    site('prod', '生产'),
    site('stage', '预发'),
  ]

  it('按 id 或名称选择', () => {
    assert.equal(selectSite(sites, '', 'stage').id, 'stage')
    assert.equal(selectSite(sites, '', '生产').id, 'prod')
  })

  it('唯一站点或默认站点可以省略参数', () => {
    assert.equal(selectSite([sites[0]], '', undefined).id, 'prod')
    assert.equal(selectSite(sites, 'stage', undefined).id, 'stage')
  })

  it('多个站点且没有默认值时要求指定', () => {
    assert.throws(() => selectSite(sites, '', undefined), /请在参数 site 中指定/)
  })

  it('没有站点时指向设置页', () => {
    assert.throws(() => selectSite([], '', undefined), /设置 → ArgoCD连接/)
  })

  it('丢弃缺少凭据引用的记录', () => {
    assert.equal(normalizeSite({ id: 'prod', name: '生产', baseUrl: 'https://cd.example', username: 'admin' }), undefined)
  })
})

function site(id, name) {
  return {
    id,
    name,
    baseUrl: 'https://cd.example',
    username: 'admin',
    passwordRef: passwordRefFor(id),
    timeoutMs: 15000,
    insecureSkipTls: false,
  }
}
