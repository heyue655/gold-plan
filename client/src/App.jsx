import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import HomePage from './pages/HomePage'
import MyPage from './pages/MyPage'
import LedgerPage from './pages/LedgerPage'
import FinancePage from './pages/FinancePage'
import SavingsPlanPage from './pages/SavingsPlanPage'
import Layout from './components/Layout'
import SsoLogin from './pages/SsoLogin'
import SsoBind from './pages/SsoBind'

function PrivateRoute({ children }) {
  const { token } = useAuth()
  return token ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/sso-login" element={<SsoLogin />} />
      <Route path="/sso-bind" element={<SsoBind />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout>
              <DashboardPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/repayments"
        element={
          <PrivateRoute>
            <Layout>
              <HomePage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/my"
        element={
          <PrivateRoute>
            <Layout>
              <MyPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/ledger"
        element={
          <PrivateRoute>
            <Layout>
              <LedgerPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/finance"
        element={
          <PrivateRoute>
            <Layout>
              <FinancePage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/savings-plan"
        element={
          <PrivateRoute>
            <SavingsPlanPage />
          </PrivateRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
