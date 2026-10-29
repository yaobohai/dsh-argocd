window.__ModuleLoader__.load({
  id: 'dsh-argocd',
  factory(require) {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')

    const name = 'dsh-argocd'
    const ENTRY_ID = 'dsh-argocd'
    const SECTION_ID = 'argocd-connections'
    const inject = ['slots', 'configForms', 'remote.credentials', 'connection']
    const EMPTY_SITES = []

    function passwordRefFor(siteId) {
      const body = String(siteId ?? '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
      return `ARGOCD_${body || 'SITE'}_PASSWORD`
    }

    function isSiteId(value) {
      return /^[a-z][a-z0-9-]{0,31}$/.test(value)
    }

    function apply(ctx) {
      const form = ctx.configForms.get(ENTRY_ID)
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: SECTION_ID,
        order: 40,
        label: () => 'ArgoCD连接',
      }, function ArgocdConnectionsSection() {
        return React.createElement(SectionBoundary, null, React.createElement(ConnectionsPage, { form, ctx }))
      }))
    }

    function ConnectionsPage({ form, ctx }) {
      // 必须包一层：直接把方法交给 React 会丢掉 this，读到 this.store 即报错。
      const subscribe = React.useCallback((listener) => form.subscribe(listener), [form])
      const getSnapshot = React.useCallback(() => form.getSnapshot(), [form])
      const snapshot = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
      const sites = Array.isArray(snapshot.value?.sites) ? snapshot.value.sites : EMPTY_SITES
      const defaultSiteId = typeof snapshot.value?.defaultSiteId === 'string' ? snapshot.value.defaultSiteId : ''
      const [editor, setEditor] = React.useState(null)
      const [presence, setPresence] = React.useState({})
      const [notice, setNotice] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const refKey = sites.map((site) => site?.passwordRef).filter((ref) => typeof ref === 'string' && ref).join('\n')

      React.useEffect(() => {
        const refs = refKey ? [...new Set(refKey.split('\n'))] : []
        if (refs.length === 0) return undefined
        let cancelled = false
        ctx.remote.credentials.describe(refs).then((result) => {
          if (cancelled || !result?.ok) return
          setPresence(result.value ?? {})
        }).catch(() => {
          if (!cancelled) setPresence({})
        })
        return () => {
          cancelled = true
        }
      }, [ctx, refKey])

      React.useEffect(() => {
        if (!editor || editor.mode !== 'edit') return
        if (editor.index >= sites.length) setEditor(null)
      }, [editor, sites.length])

      if (snapshot.status === 'loading') return React.createElement('p', null, '正在读取 Argo CD 连接…')
      if (snapshot.status === 'unavailable') {
        return React.createElement('p', null, 'Argo CD 连接还不可用。请确认插件已加载，并且条目 id 是 dsh-argocd。')
      }

      const openNew = () => {
        setNotice('')
        setEditor({
          mode: 'new',
          index: -1,
          id: '',
          name: '',
          baseUrl: '',
          username: 'admin',
          timeoutSec: '15',
          insecureSkipTls: false,
          password: '',
          makeDefault: sites.length === 0 || !defaultSiteId,
        })
      }

      const openSite = (index) => {
        const site = sites[index]
        if (!site) return
        setNotice('')
        setEditor({
          mode: 'edit',
          index,
          id: site.id ?? '',
          name: site.name ?? '',
          baseUrl: site.baseUrl ?? '',
          username: site.username ?? '',
          timeoutSec: String(Math.round(Number(site.timeoutMs || 15000) / 1000)),
          insecureSkipTls: site.insecureSkipTls === true,
          password: '',
          makeDefault: defaultSiteId === site.id,
        })
      }

      return React.createElement('section', { style: pageStyle },
        React.createElement('h2', { style: titleStyle }, 'ArgoCD连接'),
        React.createElement('p', { style: hintStyle }, '在这里管理多个 Argo CD 站点。密码只写入凭据服务，配置里只保存引用名，页面不会回显已保存的密码。'),
        !snapshot.writable ? React.createElement('p', { style: hintStyle }, '当前配置不可写。') : null,
        React.createElement('div', { style: layoutStyle },
          React.createElement('div', { style: listStyle },
            sites.map((site, index) => React.createElement('button', {
              key: `${site.id ?? index}`,
              type: 'button',
              onClick: () => openSite(index),
              style: {
                ...itemStyle,
                borderColor: editor?.mode === 'edit' && editor.index === index ? 'currentColor' : 'transparent',
              },
            },
            React.createElement('strong', null, site.name || site.id || '未命名'),
            defaultSiteId === site.id ? React.createElement('span', { style: badgeStyle }, '默认') : null,
            React.createElement('span', { style: metaStyle }, site.baseUrl || ''),
            )),
            React.createElement('button', { type: 'button', onClick: openNew, disabled: !snapshot.writable || busy, style: buttonStyle }, '添加站点'),
          ),
          editor
            ? React.createElement(SiteEditor, {
              ctx,
              editor,
              setEditor,
              sites,
              defaultSiteId,
              presence,
              form,
              revision: snapshot.revision,
              writable: snapshot.writable,
              busy,
              setBusy,
              notice,
              setNotice,
            })
            : React.createElement('p', { style: hintStyle }, sites.length ? '选择左侧站点，或添加一个新站点。' : '还没有站点。'),
        ),
      )
    }

    function SiteEditor(props) {
      const { ctx, editor, setEditor, sites, defaultSiteId, presence, form, revision, writable, busy, setBusy, notice, setNotice } = props
      const existing = editor.mode === 'edit' ? sites[editor.index] : undefined
      const passwordRef = existing?.passwordRef || passwordRefFor(editor.id)
      const described = presence[passwordRef]
      const passwordLocked = described?.writable === false && described?.configured === true
      const configured = described?.configured === true

      const setField = (key, value) => setEditor({ ...editor, [key]: value })

      const save = async () => {
        const record = buildRecord(editor, passwordRef)
        const problem = validate(record, editor, sites, described)
        if (problem) {
          setNotice(problem)
          return
        }
        setBusy(true)
        setNotice('')
        let createdCredential = false
        try {
          if (editor.password) {
            const before = await ctx.remote.credentials.describe([record.passwordRef])
            if (!before?.ok) throw new Error(remoteMessage(before, '无法确认凭据状态'))
            createdCredential = before.value?.[record.passwordRef]?.configured !== true
            const wrote = await ctx.remote.credentials.set(record.passwordRef, editor.password)
            if (!wrote?.ok) throw new Error(remoteMessage(wrote, '密码没有写入凭据服务'))
          }
          const next = editor.mode === 'new'
            ? [...sites.map(plainSite), record]
            : sites.map((site, index) => index === editor.index ? record : plainSite(site))
          const ops = [{ op: 'set', path: ['sites'], value: next }]
          const nextDefault = editor.makeDefault ? record.id : (defaultSiteId === record.id ? '' : defaultSiteId)
          if (nextDefault !== defaultSiteId) ops.push({ op: 'set', path: ['defaultSiteId'], value: nextDefault })
          const accepted = await form.mutate(ops, revision)
          if (!accepted) {
            if (createdCredential) await ctx.remote.credentials.unset(record.passwordRef)
            throw new Error(editor.password && !createdCredential ? '连接信息没有保存，但新密码已经写入凭据服务' : '配置没有保存')
          }
          setEditor({ ...editor, mode: 'edit', index: editor.mode === 'new' ? next.length - 1 : editor.index, password: '', makeDefault: nextDefault === record.id })
          setNotice('已保存。密码没有写入配置。')
        } catch (error) {
          setNotice(hideSecret(error instanceof Error ? error.message : '保存失败', editor.password))
        } finally {
          setBusy(false)
        }
      }

      const remove = async () => {
        if (editor.mode !== 'edit' || !existing) return
        setBusy(true)
        setNotice('')
        try {
          const next = sites.filter((_, index) => index !== editor.index).map(plainSite)
          const ops = [{ op: 'set', path: ['sites'], value: next }]
          if (defaultSiteId === existing.id) ops.push({ op: 'set', path: ['defaultSiteId'], value: '' })
          const accepted = await form.mutate(ops, revision)
          if (!accepted) throw new Error('站点没有删除')
          const cleared = await ctx.remote.credentials.unset(existing.passwordRef)
          setEditor(null)
          setNotice(cleared?.ok ? '已删除站点和对应凭据。' : `站点已删除，但凭据 ${existing.passwordRef} 未能清除。`)
        } catch (error) {
          setNotice(error instanceof Error ? error.message : '删除失败')
        } finally {
          setBusy(false)
        }
      }

      const test = async () => {
        const record = buildRecord(editor, passwordRef)
        if (!record.baseUrl || !record.username) {
          setNotice('请先填写地址和用户名')
          return
        }
        setBusy(true)
        setNotice('')
        try {
          const args = {
            baseUrl: record.baseUrl,
            username: record.username,
            passwordRef: record.passwordRef,
            timeoutMs: record.timeoutMs,
            insecureSkipTls: record.insecureSkipTls,
          }
          if (editor.password) args.password = editor.password
          const result = await ctx.connection.rpc.call('/api', 'argocd/testConnection', { args })
          if (!result?.ok) throw new Error(result?.error?.message || '测试连接失败')
          const value = result.value ?? {}
          setNotice(hideSecret(value.ok ? (value.message || '连接成功') : (value.message || '连接失败'), editor.password))
        } catch (error) {
          setNotice(hideSecret(error instanceof Error ? error.message : '测试连接失败', editor.password))
        } finally {
          setBusy(false)
        }
      }

      return React.createElement('div', { style: editorStyle },
        field('站点标识', React.createElement('input', {
          value: editor.id,
          disabled: editor.mode === 'edit' || !writable || busy,
          onChange: (event) => setField('id', event.target.value.trim()),
          style: inputStyle,
          autoComplete: 'off',
        })),
        field('名称', React.createElement('input', {
          value: editor.name,
          disabled: !writable || busy,
          onChange: (event) => setField('name', event.target.value),
          style: inputStyle,
        })),
        field('地址', React.createElement('input', {
          value: editor.baseUrl,
          disabled: !writable || busy,
          placeholder: 'https://argocd.example.com',
          onChange: (event) => setField('baseUrl', event.target.value),
          style: inputStyle,
          autoComplete: 'off',
        })),
        field('用户名', React.createElement('input', {
          value: editor.username,
          disabled: !writable || busy,
          onChange: (event) => setField('username', event.target.value),
          style: inputStyle,
          autoComplete: 'off',
        })),
        field('密码', React.createElement('input', {
          type: 'password',
          value: editor.password,
          disabled: !writable || busy || passwordLocked,
          placeholder: passwordLocked ? '由环境提供，不能在此修改' : (configured ? '已配置，留空则保持不变' : '未配置'),
          onChange: (event) => setField('password', event.target.value),
          style: inputStyle,
          autoComplete: 'new-password',
        })),
        passwordLocked ? React.createElement('p', { style: hintStyle }, '这个凭据引用当前不可写，页面不会显示它的值。') : null,
        field('凭据引用', React.createElement('input', { value: passwordRef, readOnly: true, style: inputStyle })),
        field('连接超时（秒）', React.createElement('input', {
          type: 'number',
          min: 1,
          max: 300,
          value: editor.timeoutSec,
          disabled: !writable || busy,
          onChange: (event) => setField('timeoutSec', event.target.value),
          style: inputStyle,
        })),
        React.createElement('label', { style: checkStyle },
          React.createElement('input', {
            type: 'checkbox',
            checked: editor.insecureSkipTls,
            disabled: !writable || busy,
            onChange: (event) => setField('insecureSkipTls', event.target.checked),
          }),
          '跳过 TLS 证书校验',
        ),
        React.createElement('label', { style: checkStyle },
          React.createElement('input', {
            type: 'checkbox',
            checked: editor.makeDefault,
            disabled: !writable || busy,
            onChange: (event) => setField('makeDefault', event.target.checked),
          }),
          '设为默认站点',
        ),
        React.createElement('div', { style: actionsStyle },
          React.createElement('button', { type: 'button', onClick: save, disabled: !writable || busy, style: buttonStyle }, '保存'),
          React.createElement('button', { type: 'button', onClick: test, disabled: busy, style: buttonStyle }, '测试连接'),
          editor.mode === 'edit' ? React.createElement('button', { type: 'button', onClick: remove, disabled: !writable || busy, style: buttonStyle }, '删除') : null,
        ),
        notice ? React.createElement('p', { style: hintStyle }, notice) : null,
      )
    }

    class SectionBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      static getDerivedStateFromError(error) {
        return { error }
      }

      render() {
        if (this.state.error) {
          return React.createElement('p', null, `ArgoCD连接页面出错：${this.state.error.message}`)
        }
        return this.props.children
      }
    }

    function field(label, control) {
      return React.createElement('label', { style: fieldStyle },
        React.createElement('span', null, label),
        control,
      )
    }

    function buildRecord(editor, passwordRef) {
      const seconds = Number(editor.timeoutSec)
      const timeoutMs = Number.isFinite(seconds) ? Math.min(300, Math.max(1, Math.trunc(seconds))) * 1000 : 15000
      return {
        id: String(editor.id ?? '').trim(),
        name: String(editor.name ?? '').trim(),
        baseUrl: String(editor.baseUrl ?? '').trim().replace(/\/+$/, ''),
        username: String(editor.username ?? '').trim(),
        passwordRef,
        timeoutMs,
        insecureSkipTls: editor.insecureSkipTls === true,
      }
    }

    function validate(record, editor, sites, described) {
      if (!isSiteId(record.id)) return '站点标识需以小写字母开头，只含小写字母、数字和连字符，最长 32 个字符'
      if (!record.name) return '请填写名称'
      if (!/^https?:\/\//.test(record.baseUrl)) return '地址需要以 http:// 或 https:// 开头'
      if (!record.username) return '请填写用户名'
      const duplicate = sites.some((site, index) => site?.id === record.id && index !== editor.index)
      if (duplicate) return '站点标识已存在'
      const missing = described?.configured === false
      if (!editor.password && (editor.mode === 'new' || missing)) return '请填写密码。密码只会写入凭据服务。'
      return ''
    }

    function hideSecret(text, password) {
      if (!password) return text
      return String(text).split(password).join('***')
    }

    function plainSite(site) {
      return {
        id: site.id,
        name: site.name,
        baseUrl: site.baseUrl,
        username: site.username,
        passwordRef: site.passwordRef,
        timeoutMs: site.timeoutMs,
        insecureSkipTls: site.insecureSkipTls === true,
      }
    }

    function remoteMessage(result, fallback) {
      return result?.error?.message || fallback
    }

    const pageStyle = { display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '920px', color: 'inherit' }
    const titleStyle = { margin: 0, fontSize: '18px' }
    const hintStyle = { margin: 0, opacity: 0.8, lineHeight: 1.5 }
    const layoutStyle = { display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }
    const listStyle = { display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '220px', flex: '1 1 220px' }
    const itemStyle = { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px', textAlign: 'left', padding: '8px 10px', borderRadius: '8px', border: '1px solid transparent', background: 'transparent', color: 'inherit', cursor: 'pointer' }
    const badgeStyle = { fontSize: '12px', opacity: 0.75 }
    const metaStyle = { fontSize: '12px', opacity: 0.7, wordBreak: 'break-all' }
    const editorStyle = { display: 'flex', flexDirection: 'column', gap: '10px', flex: '2 1 360px', minWidth: '280px' }
    const fieldStyle = { display: 'flex', flexDirection: 'column', gap: '4px' }
    const inputStyle = { padding: '8px 10px', borderRadius: '8px', border: '1px solid color-mix(in srgb, currentColor 25%, transparent)', background: 'transparent', color: 'inherit' }
    const checkStyle = { display: 'flex', gap: '8px', alignItems: 'center' }
    const actionsStyle = { display: 'flex', gap: '8px', flexWrap: 'wrap' }
    const buttonStyle = { padding: '8px 12px', borderRadius: '8px', border: '1px solid color-mix(in srgb, currentColor 25%, transparent)', background: 'transparent', color: 'inherit', cursor: 'pointer' }

    exports.name = name
    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
