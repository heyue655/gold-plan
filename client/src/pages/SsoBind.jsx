import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function SsoBind() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const ssoUserId = new URLSearchParams(window.location.search).get('sso_user_id')

  if (!ssoUserId) {
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
        body: JSON.stringify({ email, password, sso_user_id: ssoUserId }),
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

  return (
    <div style={{ maxWidth: 360, margin: '60px auto', padding: '0 20px' }}>
      <h2 style={{ textAlign: 'center', marginBottom: 8 }}>绑定本地账号</h2>
      <p style={{ textAlign: 'center', color: '#666', fontSize: 14, marginBottom: 24 }}>
        首次从合跃盒子进入，请输入您在记账工具的账号密码完成绑定
      </p>

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
            width: '100%', padding: '12px', borderRadius: 8, border: 'none',
            background: '#4f46e5', color: '#fff', fontSize: 16, cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? '绑定中...' : '绑定并登录'}
        </button>
      </form>

      <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#999' }}>
        还没有账号？<a href="/register">去注册</a>
      </p>
    </div>
  )
}
