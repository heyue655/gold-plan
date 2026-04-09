import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function SsoBind() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // 从 URL 解析 SSO 用户信息
  let ssoInfo = null
  try {
    const raw = new URLSearchParams(window.location.search).get('sso_info')
    if (raw) ssoInfo = JSON.parse(raw)
  } catch { /* ignore */ }

  if (!ssoInfo?.sso_user_id) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: '#999' }}>
        <p>参数错误，请从合跃盒子重新进入</p>
        <a href="/login">去登录</a>
      </div>
    )
  }

  const handleBind = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/sso-bind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, sso_user_id: ssoInfo.sso_user_id }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.message || '绑定失败')
        setLoading(false)
        return
      }

      login(data.token, data.user)
      window.location.href = '/'
    } catch {
      setError('网络错误，请重试')
      setLoading(false)
    }
  }

  const handleQuickLogin = async () => {
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/sso-quick-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sso_user_id: ssoInfo.sso_user_id,
          nickname: ssoInfo.nickname,
          email: ssoInfo.email,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.message || '登录失败')
        setLoading(false)
        return
      }

      login(data.token, data.user)
      window.location.href = '/'
    } catch {
      setError('网络错误，请重试')
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: '60px auto', padding: '0 20px' }}>
      <h2 style={{ textAlign: 'center', marginBottom: 8 }}>绑定本地账号</h2>
      <p style={{ textAlign: 'center', color: '#666', fontSize: 14, marginBottom: 24 }}>
        首次从合跃盒子进入，您可以绑定已有账号或直接登录
      </p>

      {/* 快速登录按钮 */}
      <button
        onClick={handleQuickLogin}
        disabled={loading}
        style={{
          width: '100%', padding: '12px', borderRadius: 8, border: 'none',
          background: '#10b981', color: '#fff', fontSize: 16,
          cursor: loading ? 'not-allowed' : 'pointer', marginBottom: 20,
        }}
      >
        {loading ? '登录中...' : `直接登录${ssoInfo.nickname ? `（${ssoInfo.nickname}）` : ''}`}
      </button>

      <div style={{ display: 'flex', alignItems: 'center', margin: '16px 0', color: '#bbb', fontSize: 13 }}>
        <div style={{ flex: 1, height: 1, background: '#e5e5e5' }} />
        <span style={{ padding: '0 12px' }}>或绑定已有账号</span>
        <div style={{ flex: 1, height: 1, background: '#e5e5e5' }} />
      </div>

      <form onSubmit={handleBind}>
        <div style={{ marginBottom: 16 }}>
          <input
            type="email"
            placeholder="邮箱"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 15, boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <input
            type="password"
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 15, boxSizing: 'border-box' }}
          />
        </div>

        {error && <p style={{ color: '#e74c3c', fontSize: 13, marginBottom: 12 }}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%', padding: '12px', borderRadius: 8, border: '1px solid #4f46e5',
            background: '#fff', color: '#4f46e5', fontSize: 16, cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? '绑定中...' : '绑定已有账号'}
        </button>
      </form>
    </div>
  )
}
