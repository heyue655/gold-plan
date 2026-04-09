import { useEffect } from 'react'
import { useAuth } from '../context/AuthContext'

export default function SsoLogin() {
  const { login } = useAuth()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    const userStr = params.get('user')

    if (token && userStr) {
      try {
        const user = JSON.parse(userStr)
        login(token, user)
        // 用 location.href 强制整页刷新，确保 PrivateRoute 能从 localStorage 读到 token
        window.location.href = '/'
      } catch {
        window.location.href = '/login'
      }
    } else {
      window.location.href = '/login'
    }
  }, [login])

  return <div style={{ textAlign: 'center', padding: '60px 20px', color: '#999' }}>正在登录...</div>
}
