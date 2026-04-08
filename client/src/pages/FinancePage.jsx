import { useState, useEffect } from 'react'
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Divider,
  LinearProgress,
} from '@mui/material'
import {
  CheckCircle,
  RadioButtonUnchecked,
} from '@mui/icons-material'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import api from '../api/axios'
import { formatAmount } from '../utils/format'

export default function FinancePage() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dashData, setDashData] = useState(null)

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const { data } = await api.get('/stats')
        setStats(data)
      } catch (err) {
        setError(err.response?.data?.message || '加载失败')
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
    api.get('/dashboard').then(({ data }) => setDashData(data)).catch(() => {})
  }, [])

  return (
    <Box>
      <AppBar position="sticky" elevation={0} sx={{ backgroundColor: 'primary.main' }}>
        <Toolbar>
          <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>
            账房
          </Typography>
        </Toolbar>
      </AppBar>

      <Box sx={{ px: 2, py: 2 }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
            <CircularProgress />
          </Box>
        )}

        {error && <Alert severity="error">{error}</Alert>}

        {stats && (
          <>
            {/* 本月统计 */}
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                  本月统计
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Box
                    sx={{
                      flex: 1,
                      p: 1,
                      bgcolor: 'success.50',
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'success.200',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <CheckCircle sx={{ color: 'success.main', fontSize: 16 }} />
                        <Typography variant="caption" color="text.secondary">已还</Typography>
                      </Box>
                      <Typography variant="caption" color="text.disabled">
                        {stats.current_month.paid_count}/{stats.current_month.total_count}
                      </Typography>
                    </Box>
                    <Typography variant="subtitle1" fontWeight={700} color="success.main" lineHeight={1.2}>
                      ¥{formatAmount(stats.current_month.paid)}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      flex: 1,
                      p: 1,
                      bgcolor: 'error.50',
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'error.200',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <RadioButtonUnchecked sx={{ color: 'error.main', fontSize: 16 }} />
                        <Typography variant="caption" color="text.secondary">待还</Typography>
                      </Box>
                      <Typography variant="caption" color="text.disabled">
                        {stats.current_month.total_count - stats.current_month.paid_count}/{stats.current_month.total_count}
                      </Typography>
                    </Box>
                    <Typography variant="subtitle1" fontWeight={700} color="error.main" lineHeight={1.2}>
                      ¥{formatAmount(stats.current_month.unpaid)}
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>

            {/* 近6个月收支趋势 */}
            {dashData && dashData.trend.length > 0 && (
              <Card sx={{ mb: 2 }}>
                <CardContent>
                  <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                    近6个月收支趋势
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart
                      data={dashData.trend.slice(-6).map((t) => ({
                        label: `${parseInt(t.label.split('/')[1], 10)}月`,
                        income: t.income,
                        total_expense: t.total_expense,
                      }))}
                      margin={{ top: 5, right: 5, left: -15, bottom: 0 }}
                      barCategoryGap="30%"
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => v >= 10000 ? `${(v / 10000).toFixed(0)}万` : String(v)}
                      />
                      <Tooltip
                        formatter={(v, name) => [
                          `¥${formatAmount(v)}`,
                          name === 'income' ? '收入' : '支出(含还款)',
                        ]}
                      />
                      <Legend
                        formatter={(v) => (v === 'income' ? '收入' : '支出(含还款)')}
                        iconType="circle"
                        iconSize={8}
                      />
                      <Bar dataKey="income" fill="#66bb6a" radius={[3, 3, 0, 0]} maxBarSize={28} />
                      <Bar dataKey="total_expense" fill="#ef5350" radius={[3, 3, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* 本月支出明细 */}
            {dashData && dashData.current.expense_categories.length > 0 && (
              <Card sx={{ mb: 2 }}>
                <CardContent>
                  <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                    本月支出明细
                  </Typography>
                  <Divider sx={{ mb: 1.5 }} />
                  {dashData.current.expense_categories.map((cat) => {
                    const pct =
                      dashData.current.total_expense > 0
                        ? Math.min((cat.amount / dashData.current.total_expense) * 100, 100)
                        : 0
                    const isRepayment = cat.category === '还款'
                    return (
                      <Box key={cat.category} sx={{ mb: 1.5 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.4 }}>
                          <Typography variant="body2" fontWeight={500}>{cat.category}</Typography>
                          <Typography
                            variant="body2"
                            fontWeight={700}
                            sx={{ color: isRepayment ? 'secondary.main' : 'error.main' }}
                          >
                            ¥{formatAmount(cat.amount)}　{pct.toFixed(1)}%
                          </Typography>
                        </Box>
                        <LinearProgress
                          variant="determinate"
                          value={pct}
                          sx={{
                            height: 5,
                            borderRadius: 3,
                            backgroundColor: isRepayment ? '#ede7f6' : '#ffebee',
                            '& .MuiLinearProgress-bar': {
                              backgroundColor: isRepayment ? '#7e57c2' : '#ef5350',
                              borderRadius: 3,
                            },
                          }}
                        />
                      </Box>
                    )
                  })}
                </CardContent>
              </Card>
            )}

            {/* 本月收入明细 */}
            {dashData && dashData.current.income_categories.length > 0 && (
              <Card sx={{ mb: 2 }}>
                <CardContent>
                  <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                    本月收入明细
                  </Typography>
                  <Divider sx={{ mb: 1.5 }} />
                  {dashData.current.income_categories.map((cat) => {
                    const pct =
                      dashData.current.income > 0
                        ? Math.min((cat.amount / dashData.current.income) * 100, 100)
                        : 0
                    return (
                      <Box key={cat.category} sx={{ mb: 1.5 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.4 }}>
                          <Typography variant="body2" fontWeight={500}>{cat.category}</Typography>
                          <Typography variant="body2" fontWeight={700} color="success.main">
                            ¥{formatAmount(cat.amount)}　{pct.toFixed(1)}%
                          </Typography>
                        </Box>
                        <LinearProgress
                          variant="determinate"
                          value={pct}
                          sx={{
                            height: 5,
                            borderRadius: 3,
                            backgroundColor: '#e8f5e9',
                            '& .MuiLinearProgress-bar': { backgroundColor: '#66bb6a', borderRadius: 3 },
                          }}
                        />
                      </Box>
                    )
                  })}
                </CardContent>
              </Card>
            )}

            {/* 历史还款趋势 */}
            {stats.monthly_history.length > 1 && (
              <Card sx={{ mb: 2 }}>
                <CardContent>
                  <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                    历史还款趋势
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart
                      data={stats.monthly_history}
                      margin={{ top: 5, right: 10, left: -10, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="gradPaid" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#1976d2" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#1976d2" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `¥${v}`}
                      />
                      <Tooltip formatter={(v) => [`¥${formatAmount(v)}`, '已还金额']} />
                      <Area
                        type="monotone"
                        dataKey="paid_amount"
                        stroke="#1976d2"
                        strokeWidth={2}
                        fill="url(#gradPaid)"
                        dot={{ r: 3, fill: '#1976d2' }}
                        activeDot={{ r: 5 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </Box>
    </Box>
  )
}
