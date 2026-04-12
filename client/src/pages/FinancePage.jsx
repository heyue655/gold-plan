import { useState, useEffect, useCallback } from 'react'
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
  Chip,
  IconButton,
  ToggleButtonGroup,
  ToggleButton,
  Dialog,
  DialogTitle,
  DialogContent,
  List,
  ListItem,
  ListItemText,
  Menu,
  MenuItem,
} from '@mui/material'
import {
  CheckCircle,
  RadioButtonUnchecked,
  ChevronLeft,
  ChevronRight,
  Close,
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

const CATEGORIES = {
  EXPENSE: [
    '正餐', '外卖', '零食饮料', '聚餐',
    '公共交通', '打车', '加油停车',
    '日用品', '服饰美妆', '数码电子', '其他购物',
    '游戏', '影视音乐', '旅游', '运动健身',
    '住房', '水电燃气', '医疗', '通讯',
    '转账', '红包', '亲属卡', '学费培训', '宠物', '其他',
  ],
  INCOME: ['工资', '兼职', '副业', '理财', '红包', '转账', '其他'],
}

// ---- 分类进度条（支出 / 收入通用） ----
function CategoryBar({ cat, total, color, bgColor, isRepayment, onClick }) {
  const pct = total > 0 ? Math.min((cat.amount / total) * 100, 100) : 0
  const clickable = !isRepayment && onClick

  if (isRepayment && cat.paid !== undefined) {
    const paidPct = total > 0 ? Math.min((cat.paid / total) * 100, 100) : 0
    return (
      <Box sx={{ mb: 1.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.4 }}>
          <Typography variant="body2" fontWeight={500}>还款</Typography>
          <Typography variant="body2" fontWeight={700} sx={{ color: 'secondary.main' }}>
            ¥{formatAmount(cat.amount)}　{pct.toFixed(1)}%
            {cat.unpaid > 0 && (
              <Typography component="span" variant="caption" sx={{ color: 'text.disabled', ml: 0.5 }}>
                (待还 ¥{formatAmount(cat.unpaid)})
              </Typography>
            )}
          </Typography>
        </Box>
        <Box sx={{ position: 'relative', height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: '#ede7f6' }}>
          <Box sx={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${pct}%`, backgroundColor: '#7e57c244', borderRadius: 3 }} />
          <Box sx={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${paidPct}%`, backgroundColor: '#7e57c2', borderRadius: 3 }} />
        </Box>
      </Box>
    )
  }

  return (
    <Box
      onClick={clickable ? () => onClick(cat.category) : undefined}
      sx={{ mb: 1.5, cursor: clickable ? 'pointer' : 'default', borderRadius: 1, '&:hover': clickable ? { bgcolor: 'action.hover' } : {} }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.4 }}>
        <Typography variant="body2" fontWeight={500}>{cat.category}</Typography>
        <Typography variant="body2" fontWeight={700} sx={{ color }}>
          ¥{formatAmount(cat.amount)}　{pct.toFixed(1)}%
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={pct}
        sx={{
          height: 5,
          borderRadius: 3,
          backgroundColor: bgColor,
          '& .MuiLinearProgress-bar': { backgroundColor: color, borderRadius: 3 },
        }}
      />
    </Box>
  )
}

export default function FinancePage() {
  const now = new Date()
  const [viewMode, setViewMode] = useState('month') // 'month' | 'year'
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dashData, setDashData] = useState(null)
  const [yearlyData, setYearlyData] = useState(null)
  const [familyMembers, setFamilyMembers] = useState([])
  const [scope, setScope] = useState('mine')
  const [detailCategory, setDetailCategory] = useState(null) // { category, type }
  const [detailEntries, setDetailEntries] = useState([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [catMenuAnchor, setCatMenuAnchor] = useState(null) // { el, entryId, currentCat }

  useEffect(() => {
    api.get('/family').then(({ data }) => {
      setFamilyMembers(data.members)
      if (data.members.length > 0) setScope('all')
    }).catch(() => {})
  }, [])

  // 月度数据
  const fetchMonthData = useCallback(async (sc) => {
    setLoading(true)
    setError('')
    try {
      const [statsRes, dashRes] = await Promise.all([
        api.get('/stats', { params: { scope: sc } }),
        api.get('/dashboard', { params: { scope: sc } }),
      ])
      setStats(statsRes.data)
      setDashData(dashRes.data)
    } catch (err) {
      setError(err.response?.data?.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  // 年度数据
  const fetchYearData = useCallback(async (year, sc) => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/dashboard/yearly', { params: { year, scope: sc } })
      setYearlyData(res.data)
    } catch (err) {
      setError(err.response?.data?.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (viewMode === 'month') fetchMonthData(scope)
    else fetchYearData(selectedYear, scope)
  }, [viewMode, scope, selectedYear, fetchMonthData, fetchYearData])

  // 点击分类查看明细
  const handleCategoryClick = useCallback(async (category, type) => {
    setDetailCategory({ category, type })
    setDetailLoading(true)
    try {
      const params = { scope, category, type }
      if (viewMode === 'year') {
        params.year = selectedYear
      } else {
        const now = new Date()
        params.year = now.getFullYear()
        params.month = now.getMonth() + 1
      }
      const { data } = await api.get('/ledger', { params })
      setDetailEntries(data)
    } catch {
      setDetailEntries([])
    } finally {
      setDetailLoading(false)
    }
  }, [viewMode, selectedYear, scope])

  // 修改单条记录的分类
  const handleChangeCategory = useCallback(async (newCat) => {
    if (!catMenuAnchor) return
    const { entryId } = catMenuAnchor
    setCatMenuAnchor(null)
    const entry = detailEntries.find(e => e.id === entryId)
    if (!entry || entry.category === newCat) return
    try {
      await api.put(`/ledger/${entryId}`, {
        type: entry.type,
        amount: entry.amount,
        category: newCat,
        note: entry.note,
        date: entry.date,
      })
      // 从列表中移除该条（已不属于当前分类）
      setDetailEntries(prev => prev.filter(e => e.id !== entryId))
      // 刷新主数据
      if (viewMode === 'month') fetchMonthData(scope)
      else fetchYearData(selectedYear, scope)
    } catch {
      // silent
    }
  }, [catMenuAnchor, detailEntries, viewMode, scope, selectedYear, fetchMonthData, fetchYearData])

  return (
    <Box>
      <AppBar position="sticky" elevation={0} sx={{ backgroundColor: 'primary.main' }}>
        <Toolbar>
          <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>
            账房
          </Typography>
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, v) => v && setViewMode(v)}
            size="small"
            sx={{
              '& .MuiToggleButton-root': {
                color: 'rgba(255,255,255,0.7)',
                borderColor: 'rgba(255,255,255,0.3)',
                py: 0.25,
                px: 1.5,
                fontSize: 13,
                fontWeight: 600,
                '&.Mui-selected': { bgcolor: 'rgba(255,255,255,0.9)', color: 'primary.main' },
              },
            }}
          >
            <ToggleButton value="month">月度</ToggleButton>
            <ToggleButton value="year">年度</ToggleButton>
          </ToggleButtonGroup>
        </Toolbar>

        {/* 年度模式：年份选择器 */}
        {viewMode === 'year' && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', pb: 1 }}>
            <IconButton color="inherit" size="small" onClick={() => setSelectedYear((y) => y - 1)}>
              <ChevronLeft />
            </IconButton>
            <Typography variant="subtitle1" fontWeight={700} color="inherit" sx={{ mx: 2 }}>
              {selectedYear}年
            </Typography>
            <IconButton color="inherit" size="small" onClick={() => setSelectedYear((y) => y + 1)}>
              <ChevronRight />
            </IconButton>
          </Box>
        )}

        {/* 成员选择器 */}
        {familyMembers.length > 0 && (
          <Box
            sx={{
              display: 'flex',
              gap: 0.75,
              px: 2,
              pb: 1.25,
              overflowX: 'auto',
              '&::-webkit-scrollbar': { display: 'none' },
            }}
          >
            {[
              { key: 'all', label: '全部' },
              { key: 'mine', label: '只看我的' },
              ...familyMembers.map((m) => ({ key: String(m.id), label: m.username + '的' })),
            ].map((tab) => (
              <Chip
                key={tab.key}
                label={tab.label}
                size="small"
                onClick={() => setScope(tab.key)}
                sx={{
                  flexShrink: 0,
                  bgcolor: scope === tab.key ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.2)',
                  color: scope === tab.key ? 'primary.main' : '#fff',
                  fontWeight: scope === tab.key ? 700 : 400,
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.7)' },
                  border: 'none',
                }}
              />
            ))}
          </Box>
        )}
      </AppBar>

      <Box sx={{ px: 2, py: 2 }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
            <CircularProgress />
          </Box>
        )}

        {error && <Alert severity="error">{error}</Alert>}

        {/* ========== 月度视图 ========== */}
        {viewMode === 'month' && stats && (
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
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={dashData.trend.slice(-6).map((t) => ({
                        label: `${parseInt(t.label.split('/')[1], 10)}月`,
                        income: t.income,
                        paid_expense: t.paid_expense,
                        unpaid: t.repayment_unpaid,
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
                          name === 'income' ? '收入' : name === 'paid_expense' ? '已确认支出' : '待还款',
                        ]}
                      />
                      <Legend
                        formatter={(v) => v === 'income' ? '收入' : v === 'paid_expense' ? '已确认支出' : '待还款'}
                        iconType="circle"
                        iconSize={8}
                      />
                      <Bar dataKey="income" fill="#66bb6a" radius={[3, 3, 0, 0]} maxBarSize={28} />
                      <Bar dataKey="paid_expense" stackId="expense" fill="#ef5350" maxBarSize={28} />
                      <Bar dataKey="unpaid" stackId="expense" fill="#ef535066" radius={[3, 3, 0, 0]} maxBarSize={28} />
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
                  {dashData.current.expense_categories.map((cat) => (
                    <CategoryBar
                      key={cat.category}
                      cat={cat}
                      total={dashData.current.total_expense}
                      color="error.main"
                      bgColor="#ffebee"
                      isRepayment={cat.category === '还款'}
                      onClick={(c) => handleCategoryClick(c, 'EXPENSE')}
                    />
                  ))}
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
                  {dashData.current.income_categories.map((cat) => (
                    <CategoryBar
                      key={cat.category}
                      cat={cat}
                      total={dashData.current.income}
                      color="success.main"
                      bgColor="#e8f5e9"
                      onClick={(c) => handleCategoryClick(c, 'INCOME')}
                    />
                  ))}
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

        {/* ========== 年度视图 ========== */}
        {viewMode === 'year' && yearlyData && (
          <>
            {/* 年度总览 */}
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                  {yearlyData.year}年总览
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                  {[
                    { label: '总收入', value: yearlyData.summary.income, color: 'success.main' },
                    { label: '已确认支出', value: yearlyData.summary.paid_expense, color: 'error.main' },
                    { label: '待还款', value: yearlyData.summary.repayment_unpaid, color: 'warning.main' },
                    {
                      label: '结余',
                      value: yearlyData.summary.balance,
                      color: yearlyData.summary.balance >= 0 ? 'success.main' : 'error.main',
                    },
                  ].map((item) => (
                    <Box
                      key={item.label}
                      sx={{
                        flex: '1 1 40%',
                        p: 1.25,
                        bgcolor: 'grey.50',
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: 'divider',
                        textAlign: 'center',
                      }}
                    >
                      <Typography variant="caption" color="text.secondary" display="block">
                        {item.label}
                      </Typography>
                      <Typography variant="subtitle2" fontWeight={700} sx={{ color: item.color, mt: 0.25 }}>
                        ¥{formatAmount(Math.abs(item.value))}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>

            {/* 年度月度收支趋势 */}
            {yearlyData.trend.length > 0 && (
              <Card sx={{ mb: 2 }}>
                <CardContent>
                  <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                    各月收支趋势
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart
                      data={yearlyData.trend}
                      margin={{ top: 5, right: 5, left: -15, bottom: 0 }}
                      barCategoryGap="20%"
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
                          name === 'income' ? '收入' : name === 'paid_expense' ? '已确认支出' : '待还款',
                        ]}
                      />
                      <Legend
                        formatter={(v) => v === 'income' ? '收入' : v === 'paid_expense' ? '已确认支出' : '待还款'}
                        iconType="circle"
                        iconSize={8}
                      />
                      <Bar dataKey="income" fill="#66bb6a" radius={[3, 3, 0, 0]} maxBarSize={24} />
                      <Bar dataKey="paid_expense" stackId="expense" fill="#ef5350" maxBarSize={24} />
                      <Bar dataKey="unpaid" stackId="expense" fill="#ef535066" radius={[3, 3, 0, 0]} maxBarSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* 年度支出明细 */}
            {yearlyData.expense_categories.length > 0 && (
              <Card sx={{ mb: 2 }}>
                <CardContent>
                  <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                    年度支出明细
                  </Typography>
                  <Divider sx={{ mb: 1.5 }} />
                  {yearlyData.expense_categories.map((cat) => (
                    <CategoryBar
                      key={cat.category}
                      cat={cat}
                      total={yearlyData.summary.total_expense}
                      color="error.main"
                      bgColor="#ffebee"
                      isRepayment={cat.category === '还款'}
                      onClick={(c) => handleCategoryClick(c, 'EXPENSE')}
                    />
                  ))}
                </CardContent>
              </Card>
            )}

            {/* 年度收入明细 */}
            {yearlyData.income_categories.length > 0 && (
              <Card sx={{ mb: 2 }}>
                <CardContent>
                  <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                    年度收入明细
                  </Typography>
                  <Divider sx={{ mb: 1.5 }} />
                  {yearlyData.income_categories.map((cat) => (
                    <CategoryBar
                      key={cat.category}
                      cat={cat}
                      total={yearlyData.summary.income}
                      color="success.main"
                      bgColor="#e8f5e9"
                      onClick={(c) => handleCategoryClick(c, 'INCOME')}
                    />
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </Box>

      {/* ========== 分类明细弹窗 ========== */}
      <Dialog
        open={Boolean(detailCategory)}
        onClose={() => setDetailCategory(null)}
        fullWidth
        maxWidth="xs"
        PaperProps={{ sx: { maxHeight: '80vh' } }}
      >
        {detailCategory && (
          <>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', fontWeight: 700, pb: 1 }}>
              <Chip
                label={detailCategory.category}
                size="small"
                color={detailCategory.type === 'EXPENSE' ? 'error' : 'success'}
                variant="outlined"
                sx={{ mr: 1 }}
              />
              <Typography variant="subtitle1" component="span" fontWeight={700} sx={{ flex: 1 }}>
                {viewMode === 'year' ? `${selectedYear}年` : `${new Date().getFullYear()}年${new Date().getMonth() + 1}月`}
              </Typography>
              <IconButton size="small" onClick={() => setDetailCategory(null)}>
                <Close fontSize="small" />
              </IconButton>
            </DialogTitle>
            <DialogContent sx={{ px: 1, pt: 0 }}>
              {detailLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress size={28} />
                </Box>
              ) : detailEntries.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                  暂无记录
                </Typography>
              ) : (
                <List dense disablePadding>
                  {detailEntries.map((entry, idx) => (
                    <Box key={entry.id}>
                      {idx > 0 && <Divider />}
                      <ListItem sx={{ px: 1.5, gap: 1 }}>
                        <Chip
                          label={entry.category}
                          size="small"
                          color={entry.type === 'EXPENSE' ? 'error' : 'success'}
                          variant="outlined"
                          clickable
                          onClick={(e) => setCatMenuAnchor({ el: e.currentTarget, entryId: entry.id, currentCat: entry.category })}
                          sx={{ flexShrink: 0, fontSize: 11 }}
                        />
                        <ListItemText
                          primary={entry.note || entry.category}
                          secondary={entry.date}
                          primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                          secondaryTypographyProps={{ variant: 'caption' }}
                          sx={{ minWidth: 0 }}
                        />
                        <Typography
                          variant="body2"
                          fontWeight={700}
                          sx={{
                            flexShrink: 0,
                            color: entry.type === 'EXPENSE' ? 'error.main' : 'success.main',
                          }}
                        >
                          {entry.type === 'EXPENSE' ? '-' : '+'}¥{formatAmount(entry.amount)}
                        </Typography>
                      </ListItem>
                    </Box>
                  ))}
                  <Divider />
                  <ListItem sx={{ px: 1.5 }}>
                    <ListItemText
                      primary={`共 ${detailEntries.length} 笔`}
                      primaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }}
                    />
                    <Typography variant="body2" fontWeight={700} color="text.primary">
                      合计 ¥{formatAmount(detailEntries.reduce((s, e) => s + e.amount, 0))}
                    </Typography>
                  </ListItem>
                </List>
              )}
            </DialogContent>
          </>
        )}
      </Dialog>

      {/* 分类选择菜单 */}
      <Menu
        anchorEl={catMenuAnchor?.el}
        open={Boolean(catMenuAnchor)}
        onClose={() => setCatMenuAnchor(null)}
        slotProps={{ paper: { sx: { maxHeight: 320 } } }}
      >
        {(CATEGORIES[detailCategory?.type] || []).map((cat) => (
          <MenuItem
            key={cat}
            selected={cat === catMenuAnchor?.currentCat}
            onClick={() => handleChangeCategory(cat)}
            dense
            sx={{ fontSize: 13 }}
          >
            {cat}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  )
}
