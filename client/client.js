window.__ModuleLoader__.load({
  id: 'dsh-argocd',
  factory(require) {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')

    const name = 'dsh-argocd'
    const ENTRY_ID = 'dsh-argocd'
    const SECTION_ID = 'argocd-connections'
    const inject = ['slots', 'configForms', 'remote', 'remote.credentials', 'connection']
    const EMPTY_SITES = []
    const DEFAULT_TIMEOUT_SEC = '30'
    const DEFAULT_TIMEOUT_MS = 30000

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
      const [notice, setNotice] = React.useState(null)
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
        setNotice(null)
        setEditor({
          mode: 'new',
          index: -1,
          id: '',
          name: '',
          baseUrl: '',
          username: 'admin',
          timeoutSec: DEFAULT_TIMEOUT_SEC,
          insecureSkipTls: false,
          password: '',
          makeDefault: sites.length === 0 || !defaultSiteId,
        })
      }

      const openSite = (index) => {
        const site = sites[index]
        if (!site) return
        setNotice(null)
        setEditor({
          mode: 'edit',
          index,
          id: site.id ?? '',
          name: site.name ?? '',
          baseUrl: site.baseUrl ?? '',
          username: site.username ?? '',
          timeoutSec: String(Math.round(Number(site.timeoutMs || DEFAULT_TIMEOUT_MS) / 1000)),
          insecureSkipTls: site.insecureSkipTls === true,
          password: '',
          makeDefault: defaultSiteId === site.id,
        })
      }

      if (snapshot.status === 'loading') {
        return React.createElement('div', { style: pageStyle }, messageCard('正在读取 Argo CD 连接…'))
      }
      if (snapshot.status === 'unavailable') {
        return React.createElement('div', { style: pageStyle }, messageCard('Argo CD 连接还不可用。请确认插件已加载，并且条目 id 是 dsh-argocd。'))
      }

      const adding = editor?.mode === 'new'
      const editorProps = {
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
      }
      return React.createElement('div', { style: pageStyle },
        !snapshot.writable ? messageCard('当前配置不可写。') : null,
        sites.map((site, index) => {
          const open = editor?.mode === 'edit' && editor.index === index
          return React.createElement('section', { key: site.id ?? index, style: cardStyle },
            cardHead(
              site.name || site.id || '未命名',
              defaultSiteId === site.id,
              site.baseUrl || '未填写地址',
              open,
              () => {
                setNotice(null)
                if (open) setEditor(null)
                else openSite(index)
              },
            ),
            open ? React.createElement(SiteEditor, editorProps) : null,
          )
        }),
        React.createElement('section', { style: cardStyle },
          cardHead(
            '添加站点',
            false,
            sites.length
              ? '再接入一个 Argo CD。密码只写入凭据服务，不会出现在配置里。'
              : '还没有站点。密码只写入凭据服务，配置里只保存引用名，页面不会回显已保存的密码。',
            adding,
            () => {
              setNotice(null)
              if (adding) setEditor(null)
              else openNew()
            },
          ),
          adding ? React.createElement(SiteEditor, editorProps) : null,
        ),
        !editor && notice ? React.createElement('p', { style: messageStyle(notice.kind) }, notice.text) : null,
      )
    }

    function SiteEditor(props) {
      const { ctx, editor, setEditor, sites, defaultSiteId, presence, form, revision, writable, busy, setBusy, notice, setNotice } = props
      const [confirmingDelete, setConfirmingDelete] = React.useState(false)
      const existing = editor.mode === 'edit' ? sites[editor.index] : undefined
      const passwordRef = existing?.passwordRef || passwordRefFor(editor.id)
      const described = presence[passwordRef]
      const passwordLocked = described?.writable === false && described?.configured === true
      const configured = described?.configured === true

      const setField = (key, value) => setEditor({ ...editor, [key]: value })

      const fieldRefs = {
        id: React.useRef(null),
        name: React.useRef(null),
        baseUrl: React.useRef(null),
        username: React.useRef(null),
        password: React.useRef(null),
        timeoutSec: React.useRef(null),
      }
      // 数字框常常在失焦时才提交。点保存时先读 DOM，避免仍用上一次的超时。
      const draftEditor = () => ({
        ...editor,
        id: fieldRefs.id.current?.value ?? editor.id,
        name: fieldRefs.name.current?.value ?? editor.name,
        baseUrl: fieldRefs.baseUrl.current?.value ?? editor.baseUrl,
        username: fieldRefs.username.current?.value ?? editor.username,
        password: fieldRefs.password.current?.value ?? editor.password,
        timeoutSec: fieldRefs.timeoutSec.current?.value ?? editor.timeoutSec,
      })

      const save = async () => {
        const draft = draftEditor()
        const record = buildRecord(draft, passwordRef)
        const problem = validate(record, draft, sites, described)
        if (problem) {
          setNotice({ kind: 'error', text: problem })
          return
        }
        setBusy(true)
        setNotice(null)
        let createdCredential = false
        try {
          if (draft.password) {
            const before = await ctx.remote.credentials.describe([record.passwordRef])
            if (!before?.ok) throw new Error(remoteMessage(before, '无法确认凭据状态'))
            createdCredential = before.value?.[record.passwordRef]?.configured !== true
            const wrote = await ctx.remote.credentials.set(record.passwordRef, draft.password)
            if (!wrote?.ok) throw new Error(remoteMessage(wrote, '密码没有写入凭据服务'))
          }
          const next = draft.mode === 'new'
            ? [...sites.map(plainSite), record]
            : sites.map((site, index) => index === draft.index ? record : plainSite(site))
          const ops = draft.mode === 'new'
            ? [{ op: 'set', path: ['sites'], value: next }]
            : ['name', 'baseUrl', 'username', 'passwordRef', 'timeoutMs', 'insecureSkipTls'].map((key) => ({
              op: 'set',
              path: ['sites', String(draft.index), key],
              value: record[key],
            }))
          const nextDefault = draft.makeDefault ? record.id : (defaultSiteId === record.id ? '' : defaultSiteId)
          if (nextDefault !== defaultSiteId) ops.push({ op: 'set', path: ['defaultSiteId'], value: nextDefault })
          const accepted = await form.mutate(ops, revision)
          if (!accepted) {
            if (createdCredential) await ctx.remote.credentials.unset(record.passwordRef)
            throw new Error(draft.password && !createdCredential ? '连接信息没有保存，但新密码已经写入凭据服务' : '配置没有保存')
          }
          setEditor({ ...draft, mode: 'edit', index: draft.mode === 'new' ? next.length - 1 : draft.index, password: '', timeoutSec: String(record.timeoutMs / 1000), makeDefault: nextDefault === record.id })
          setNotice({ kind: 'ok', text: '已保存。密码没有写入配置。' })
        } catch (error) {
          setNotice({ kind: 'error', text: hideSecret(error instanceof Error ? error.message : '保存失败', draft.password) })
        } finally {
          setBusy(false)
        }
      }

      const remove = async () => {
        if (editor.mode !== 'edit' || !existing) return
        setBusy(true)
        setNotice(null)
        setConfirmingDelete(false)
        try {
          const next = sites.filter((_, index) => index !== editor.index).map(plainSite)
          const ops = [{ op: 'set', path: ['sites'], value: next }]
          if (defaultSiteId === existing.id) ops.push({ op: 'set', path: ['defaultSiteId'], value: '' })
          const accepted = await form.mutate(ops, revision)
          if (!accepted) throw new Error('站点没有删除')
          const cleared = await ctx.remote.credentials.unset(existing.passwordRef)
          setEditor(null)
          setNotice({
            kind: cleared?.ok ? 'ok' : 'error',
            text: cleared?.ok ? '已删除站点和对应凭据。' : `站点已删除，但凭据 ${existing.passwordRef} 未能清除。`,
          })
        } catch (error) {
          setNotice({ kind: 'error', text: error instanceof Error ? error.message : '删除失败' })
        } finally {
          setBusy(false)
        }
      }

      const test = async () => {
        const draft = draftEditor()
        const record = buildRecord(draft, passwordRef)
        if (!record.baseUrl || !record.username) {
          setNotice({ kind: 'error', text: '请先填写地址和用户名' })
          return
        }
        setBusy(true)
        setNotice(null)
        try {
          const args = {
            baseUrl: record.baseUrl,
            username: record.username,
            passwordRef: record.passwordRef,
            timeoutMs: record.timeoutMs,
            insecureSkipTls: record.insecureSkipTls,
          }
          if (draft.password) args.password = draft.password
          const result = await ctx.connection.rpc.call('/api', 'argocd/testConnection', { args })
          if (!result?.ok) throw new Error(result?.error?.message || '测试连接失败')
          const value = result.value ?? {}
          setNotice({
            kind: value.ok ? 'ok' : 'error',
            text: hideSecret(value.ok ? (value.message || '连接成功') : (value.message || '连接失败'), draft.password),
          })
        } catch (error) {
          setNotice({ kind: 'error', text: hideSecret(error instanceof Error ? error.message : '测试连接失败', draft.password) })
        } finally {
          setBusy(false)
        }
      }

      const locked = !writable || busy
      return React.createElement('div', { style: editorStyle },
        field('站点标识', React.createElement('input', {
          ref: fieldRefs.id,
          value: editor.id,
          disabled: editor.mode === 'edit' || locked,
          onChange: (event) => setField('id', event.target.value.trim()),
          style: inputStyle,
          autoComplete: 'off',
        })),
        field('名称', React.createElement('input', {
          ref: fieldRefs.name,
          value: editor.name,
          disabled: locked,
          onChange: (event) => setField('name', event.target.value),
          style: inputStyle,
        })),
        field('地址', React.createElement('input', {
          ref: fieldRefs.baseUrl,
          value: editor.baseUrl,
          disabled: locked,
          placeholder: 'https://argocd.example.com',
          onChange: (event) => setField('baseUrl', event.target.value),
          style: inputStyle,
          autoComplete: 'off',
        })),
        field('用户名', React.createElement('input', {
          ref: fieldRefs.username,
          value: editor.username,
          disabled: locked,
          onChange: (event) => setField('username', event.target.value),
          style: inputStyle,
          autoComplete: 'off',
        })),
        field('密码', React.createElement('input', {
          ref: fieldRefs.password,
          type: 'password',
          value: editor.password,
          disabled: locked || passwordLocked,
          placeholder: passwordLocked ? '由环境提供，不能在此修改' : (configured ? '已配置，留空则保持不变' : '未配置'),
          onChange: (event) => setField('password', event.target.value),
          style: inputStyle,
          autoComplete: 'new-password',
        })),
        passwordLocked ? React.createElement('p', { style: hintStyle }, '这个凭据引用当前不可写，页面不会显示它的值。') : null,
        field('凭据引用', React.createElement('input', { value: passwordRef, readOnly: true, style: inputStyle })),
        field('连接超时（秒）', React.createElement('input', {
          ref: fieldRefs.timeoutSec,
          type: 'number',
          min: 1,
          max: 300,
          value: editor.timeoutSec,
          disabled: locked,
          onChange: (event) => setField('timeoutSec', event.target.value),
          style: inputStyle,
        })),
        toggle('跳过 TLS 证书校验', editor.insecureSkipTls, locked, (checked) => setField('insecureSkipTls', checked)),
        toggle('设为默认站点', editor.makeDefault, locked, (checked) => setField('makeDefault', checked)),
        React.createElement('div', { style: actionsStyle },
          actionButton('保存', save, locked, 'primary'),
          actionButton('测试连接', test, busy, 'secondary'),
          editor.mode === 'edit' ? React.createElement('div', { style: { position: 'relative' } },
            actionButton('删除', () => setConfirmingDelete(true), locked, 'danger'),
            confirmingDelete ? React.createElement('div', {
              role: 'alertdialog',
              'aria-label': '确认删除站点',
              style: popoverStyle,
            },
            React.createElement('div', { 'aria-hidden': true, style: popoverArrowStyle }),
            React.createElement('div', { style: popoverTextStyle }, '删除后，这个站点的连接信息和对应凭据都会去掉。'),
            React.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8 } },
              actionButton('取消', () => setConfirmingDelete(false), busy, 'secondary', true),
              actionButton('确认删除', remove, locked, 'danger-fill', true),
            ),
            ) : null,
          ) : null,
        ),
        notice ? React.createElement('p', { style: messageStyle(notice.kind) }, notice.text) : null,
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

    function messageCard(text) {
      return React.createElement('section', { style: cardStyle },
        React.createElement('p', { style: hintStyle }, text),
      )
    }

    function cardHead(title, isDefault, description, expanded, onToggle) {
      return React.createElement('div', { style: headRowStyle },
        React.createElement('div', { style: { minWidth: 0 } },
          React.createElement('h2', { style: cardTitleStyle },
            title,
            isDefault ? React.createElement('span', { style: badgeStyle }, '默认') : null,
          ),
          React.createElement('p', { style: hintStyle }, description),
        ),
        React.createElement('button', {
          type: 'button',
          onClick: onToggle,
          'aria-expanded': expanded,
          'aria-label': expanded ? '收起' : '展开',
          style: iconButtonStyle,
        }, chevron(expanded)),
      )
    }

    function chevron(up) {
      return React.createElement('svg', {
        width: 14,
        height: 14,
        viewBox: '0 0 14 14',
        'aria-hidden': true,
        style: {
          color: 'var(--dsw-alias-label-secondary, #333)',
          transform: up ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s ease',
          transformOrigin: 'center',
        },
      }, React.createElement('path', {
        d: 'M3 5 L7 9 L11 5',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }))
    }

    function toggle(label, checked, disabled, onChange) {
      return React.createElement('label', {
        style: { display: 'inline-flex', alignItems: 'center', gap: 8, cursor: disabled ? 'default' : 'pointer', fontSize: 13, color: 'var(--dsw-alias-label-primary, #333)' },
      },
      React.createElement('span', {
        style: {
          position: 'relative',
          width: 40,
          height: 22,
          borderRadius: 11,
          background: checked ? 'var(--dsw-alias-button-info-fill, #4d6bfe)' : 'var(--dsw-alias-bg-overlay, #c4c4c4)',
          opacity: disabled ? 0.5 : 1,
          transition: 'background 0.2s',
          flexShrink: 0,
        },
      },
      React.createElement('input', {
        type: 'checkbox',
        checked,
        disabled,
        onChange: (event) => onChange(event.target.checked),
        style: { position: 'absolute', inset: 0, margin: 0, width: '100%', height: '100%', opacity: 0, cursor: 'inherit' },
      }),
      React.createElement('span', {
        style: {
          position: 'absolute',
          top: 2,
          left: checked ? 20 : 2,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#ffffff',
          transition: 'left 0.2s',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
        },
      }),
      ),
      label,
      )
    }

    function actionButton(label, onClick, disabled, variant, compact) {
      const palette = variant === 'primary'
        ? { background: 'var(--dsw-alias-button-info-fill, #4d6bfe)', color: '#ffffff', borderColor: 'transparent' }
        : variant === 'danger'
          ? { background: 'none', color: 'var(--dsw-alias-state-error-primary, #d4380d)', borderColor: 'var(--dsw-alias-state-error-primary, #d4380d)' }
          : variant === 'danger-fill'
            ? { background: 'var(--dsw-alias-state-error-primary, #d4380d)', color: '#ffffff', borderColor: 'transparent' }
            : { background: 'none', color: 'var(--dsw-alias-label-primary, #333)', borderColor: 'var(--dsw-alias-border-l2, #d9d9d9)' }
      return React.createElement('button', {
        type: 'button',
        onClick,
        disabled,
        style: {
          ...buttonStyle,
          ...palette,
          padding: compact ? '4px 12px' : buttonStyle.padding,
          opacity: disabled ? 0.55 : 1,
          cursor: disabled ? 'default' : 'pointer',
        },
      }, label)
    }

    function messageStyle(kind) {
      return {
        fontSize: 13,
        margin: '12px 0 0',
        color: kind === 'ok'
          ? 'var(--dsw-alias-state-success-primary, #237804)'
          : 'var(--dsw-alias-state-error-primary, #d4380d)',
      }
    }

    function buildRecord(editor, passwordRef) {
      const seconds = Number(editor.timeoutSec)
      const timeoutMs = Number.isFinite(seconds) ? Math.min(300, Math.max(1, Math.trunc(seconds))) * 1000 : DEFAULT_TIMEOUT_MS
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

    const pageStyle = { display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 520 }
    const cardStyle = {
      border: '1px solid var(--dsw-alias-border-l2, #e5e5e5)',
      borderRadius: 10,
      padding: '18px 20px',
      background: 'var(--dsw-alias-bg-layer-1, #ffffff)',
      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
    }
    const headRowStyle = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }
    const cardTitleStyle = { fontSize: 16, fontWeight: 600, margin: '0 0 4px', color: 'var(--dsw-alias-label-primary, #333)' }
    const badgeStyle = { marginLeft: 8, fontSize: 12, fontWeight: 400, color: 'var(--dsw-alias-label-tertiary, #666)' }
    const hintStyle = { fontSize: 13, color: 'var(--dsw-alias-label-tertiary, #666)', margin: 0, lineHeight: 1.5, wordBreak: 'break-all' }
    const editorStyle = { display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }
    const fieldStyle = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--dsw-alias-label-primary, #333)' }
    const inputStyle = {
      width: '100%',
      boxSizing: 'border-box',
      padding: '8px 10px',
      border: '1px solid var(--dsw-alias-border-l2, #d9d9d9)',
      borderRadius: 6,
      fontSize: 14,
      fontFamily: 'inherit',
      background: 'var(--dsw-specific-input-major, #ffffff)',
      color: 'var(--dsw-alias-label-primary, #333)',
    }
    const actionsStyle = { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }
    const buttonStyle = {
      padding: '8px 16px',
      borderRadius: 6,
      fontSize: 14,
      fontFamily: 'inherit',
      cursor: 'pointer',
      border: '1px solid transparent',
    }
    const iconButtonStyle = {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: 12,
      margin: -12,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'inherit',
      flexShrink: 0,
    }
    const popoverStyle = {
      position: 'absolute',
      top: 'calc(100% + 10px)',
      left: 0,
      zIndex: 10,
      minWidth: 260,
      padding: '12px 14px',
      background: 'var(--dsw-specific-menu, #ffffff)',
      border: '1px solid var(--dsw-alias-border-l3, #e5e5e5)',
      borderRadius: 8,
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.12)',
    }
    const popoverArrowStyle = {
      position: 'absolute',
      top: -6,
      left: 28,
      width: 10,
      height: 10,
      background: 'var(--dsw-specific-menu, #ffffff)',
      borderLeft: '1px solid var(--dsw-alias-border-l3, #e5e5e5)',
      borderTop: '1px solid var(--dsw-alias-border-l3, #e5e5e5)',
      transform: 'rotate(45deg)',
    }
    const popoverTextStyle = { fontSize: 13, color: 'var(--dsw-alias-label-primary, #333)', marginBottom: 10 }

    exports.name = name
    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
