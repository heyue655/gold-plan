import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Button,
  Chip,
  Divider,
  LinearProgress,
  IconButton,
  Collapse,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
} from '@mui/material'
import {
  ArrowBack,
  AutoAwesome,
  ExpandMore,
  ExpandLess,
  CheckCircle,
  Cancel,
  Schedule,
  Refresh,
  Warning,
  AccountBalanceWallet,
  Savings,
  CreditCard,
  InfoOutlined,
} from '@mui/icons-material'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import api from '../api/axios'
import { formatAmount } from '../utils/format'
import GeneratePlanDialog from '../components/GeneratePlanDialog'

const STATUS_CONFIG = {
  UNDER_BUDGET: { label: '未超支', color: 'success', icon: <CheckCircle sx={{ fontSize: 16 }} /> },
  OVER_BUDGET:  { label: '超支',   color: 'error',   icon: <Cancel sx={{ fontSize: 16 }} /> },
  IN_PROGRESS:  { label: '进行中', color: 'info',    icon: <Schedule sx={{ fontSize: 16 }} /> },
  UPCOMING:     { label: '待开始', color: 'default',  icon: <Schedule sx={{ fontSize: 16 }} /> },
}

const CLASSIFICATION_LABELS = {
  'essential': { label: '必要', color: '#9e9e9e' },
  'semi-essential': { label: '半必要', color: '#ff9800' },
  'non-essential': { label: '非必要', color: '#f44336' },
}

export default function SavingsPlanPage() {
  const navigate = useNavigate()
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [generating, setGenerating] = useState(false)
  const [adjusting, setAdjusting] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [expandedWeek, setExpandedWeek] = useState(null)

  // 家庭成员 tabs
  const [members, setMembers] = useState([])
  const [activeTab, setActiveTab] = useState(0) // 0 = 我的
  const [viewUserId, setViewUserId] = useState(null) // null = 自己

  // 拉取家庭成员
  useEffect(() => {
    api.get('/family').then(({ data }) => {
      setMembers(data.members || [])
    }).catch(() => {})
  }, [])

  // Poll until plan appears (max ~60s)
  const pollForPlan = useCallback(async (setFlag) => {
    const maxAttempts = 12
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 5000))
      try {
        const params = { scope: 'PERSONAL' }
        if (viewUserId) params.userId = viewUserId
        const res = await api.get('/savings-plan/active', { params })
        if (res.data.plan && res.data.plan.status !== 'GENERATING') {
          setPlan(res.data.plan)
          const current = res.data.plan.weeks.find((w) => w.status === 'IN_PROGRESS')
          if (current) setExpandedWeek(current.weekNumber)
          setFlag(false)
          return
        }
      } catch (_) { /* keep polling */ }
    }
    setFlag(false)
    setError('生成超时，请稍后刷新重试')
  }, [viewUserId])

  const fetchPlan = useCallback(async () => {
    try {
      setError('')
      const params = { scope: 'PERSONAL' }
      if (viewUserId) params.userId = viewUserId
      const res = await api.get('/savings-plan/active', { params })
      const p = res.data.plan
      if (p && p.status === 'GENERATING') {
        setPlan(null)
        setGenerating(true)
        pollForPlan(setGenerating)
      } else {
        setPlan(p)
        if (p) {
          const current = p.weeks.find((w) => w.status === 'IN_PROGRESS')
          if (current) setExpandedWeek(current.weekNumber)
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [pollForPlan, viewUserId])

  useEffect(() => { setLoading(true); setPlan(null); setExpandedWeek(null); fetchPlan() }, [fetchPlan])

  const handleTabChange = (_e, newVal) => {
    setActiveTab(newVal)
    setViewUserId(newVal === 0 ? null : members[newVal - 1]?.id)
  }

  const handleGenerated = () => {
    setGenerating(true)
    setDialogOpen(false)
    pollForPlan(setGenerating)
  }

  const handleAdjust = async () => {
    if (!plan) return
    setAdjusting(true)
    try {
      await api.post(`/savings-plan/${plan.id}/adjust`)
      pollForPlan(setAdjusting)
    } catch (err) {
      setError(err.response?.data?.message || '调整失败')
      setAdjusting(false)
    }
  }

  const handleAbandon = async () => {
    if (!plan || !window.confirm('确定要放弃当前计划吗？')) return
    try {
      await api.delete(`/savings-plan/${plan.id}`)
      setPlan(null)
    } catch (err) {
      setError(err.response?.data?.message || '操作失败')
    }
  }

  const hasMissedWeeks = plan?.weeks.some((w) => w.status === 'OVER_BUDGET')

  // Budget consumption: how much of the total budget has been spent
  const spentPercent = plan ? Math.min(100, Math.max(0, (plan.totalSpent / plan.totalBudget) * 100)) : 0

  // Weekly bar chart data: budget vs actual spending
  const weeklyChartData = plan?.weeks.map((w) => ({
    name: `第${w.weekNumber}周`,
    预算: w.budgetAmount,
    实际花费: w.status === 'UPCOMING' ? null : w.actualSpending,
  })) || []

  // category analysis bar data
  const categoryData = (plan?.categoryAnalysis || [])
    .filter((c) => c.classification !== 'essential')
    .map((c) => ({
      name: c.category,
      当前月均: c.avgMonthly,
      建议上限: c.suggestedMonthly,
      classification: c.classification,
    }))

  const isOwnPlan = !viewUserId
  const [formulaDialog, setFormulaDialog] = useState(null) // { title, lines }

  const showFormula = (title, lines) => setFormulaDialog({ title, lines })

  // 构建各指标公式
  const formulas = plan ? {
    income: {
      title: '月收入',
      lines: [
        `来源：${plan.monthlyIncome === plan.avgMonthlyIncome ? '近3个月已完成月份平均收入' : '用户手动填写'}`,
        `数值：¥${formatAmount(plan.monthlyIncome)}`,
      ],
    },
    savings: {
      title: '锁定留金',
      lines: [
        '公式：年度留金目标 × (计划周数 / 52) ÷ (计划周数 / 4.33)',
        `= 按计划周数占全年比例分摊到月`,
        `数值：¥${formatAmount(plan.savingsTarget)}/月`,
        '无年度目标时默认取月收入的20%',
      ],
    },
    repayment: {
      title: '月还款',
      lines: [
        '来源：近3个月已完成月份的平均信用卡还款',
        `数值：¥${formatAmount(plan.monthlyRepayment)}/月`,
      ],
    },
    budget: {
      title: '月可用预算',
      lines: [
        '公式：月收入 − 月还款 − 锁定留金',
        `= ¥${formatAmount(plan.monthlyIncome)} − ¥${formatAmount(plan.monthlyRepayment)} − ¥${formatAmount(plan.savingsTarget)}`,
        `= ¥${formatAmount(plan.monthlyBudget)}/月`,
      ],
    },
    totalBudget: {
      title: '总预算',
      lines: [
        '公式：各周预算之和（由 AI 按月可用预算分配）',
        `= ¥${formatAmount(plan.totalBudget)}（${plan.weeks.length}周）`,
        `参考：月可用预算 ¥${formatAmount(plan.monthlyBudget)} × ${plan.weeks.length}周 / 4.33`,
      ],
    },
    spent: {
      title: '已花费',
      lines: [
        '来源：已开始及已结束周的实际支出合计',
        `数值：¥${formatAmount(plan.totalSpent)}`,
      ],
    },
    remaining: {
      title: '剩余可花',
      lines: [
        '公式：总预算 − 已花费',
        `= ¥${formatAmount(plan.totalBudget)} − ¥${formatAmount(plan.totalSpent)}`,
        `= ¥${formatAmount(plan.totalRemaining)}`,
      ],
    },
  } : {}

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ pb: 8 }}>
      {/* Header */}
      <AppBar position="static" color="transparent" elevation={0}>
        <Toolbar sx={{ minHeight: 56 }}>
          <IconButton edge="start" onClick={() => navigate('/my')} sx={{ mr: 1 }}>
            <ArrowBack />
          </IconButton>
          <AutoAwesome sx={{ color: 'warning.main', mr: 1, fontSize: 20 }} />
          <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>
            预算控制计划
          </Typography>
          {plan && (
            <IconButton onClick={() => { setLoading(true); fetchPlan() }}>
              <Refresh />
            </IconButton>
          )}
        </Toolbar>
      </AppBar>

      {/* 家庭成员 Tabs */}
      {members.length > 0 && (
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ px: 1, minHeight: 40, '& .MuiTab-root': { minHeight: 40, py: 0.5, fontSize: 13 } }}
        >
          <Tab label="我的计划" />
          {members.map((m) => (
            <Tab key={m.id} label={`${m.username}的计划`} />
          ))}
        </Tabs>
      )}

      <Box sx={{ px: 2, pt: 1 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {adjusting && plan && (
          <Alert severity="info" sx={{ mb: 2 }}>
            AI 正在调整计划，请稍候…
          </Alert>
        )}

        {/* ─── No Plan State ─── */}
        {!plan && (
          <Card sx={{ textAlign: 'center', py: 4 }}>
            <CardContent>
              {generating && isOwnPlan ? (
                <>
                  <CircularProgress size={48} sx={{ color: 'warning.main', mb: 2 }} />
                  <Typography variant="h6" fontWeight={700} gutterBottom>
                    AI 正在分析您的消费记录…
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ px: 2 }}>
                    正在识别非必要开支并生成逐周计划，预计需要 10-30 秒
                  </Typography>
                </>
              ) : isOwnPlan ? (
                <>
                  <AutoAwesome sx={{ fontSize: 48, color: 'warning.main', mb: 2 }} />
                  <Typography variant="h6" fontWeight={700} gutterBottom>
                    开启 AI 预算控制计划
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3, px: 2 }}>
                    AI 将分析您的消费记录，锁定留金目标，分配每周可花预算，帮您控制支出不超标
                  </Typography>
                  <Button
                    variant="contained"
                    size="large"
                    onClick={() => setDialogOpen(true)}
                    startIcon={<AutoAwesome />}
                  >
                    生成计划
                  </Button>
                </>
              ) : (
                <>
                  <Typography variant="body1" color="text.secondary" sx={{ py: 2 }}>
                    该成员暂未制定预算控制计划
                  </Typography>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* ─── Plan Overview ─── */}
        {plan && (
          <>
            {/* Section A: Overview Card */}
            <Card sx={{ mb: 2, background: 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle1" fontWeight={700}>预算概览</Typography>
                  {isOwnPlan && (
                    <Box>
                      <Button size="small" onClick={() => setDialogOpen(true)} sx={{ mr: 0.5 }} disabled={generating}>
                        重新生成
                      </Button>
                      <Button size="small" color="error" onClick={handleAbandon}>
                        放弃
                      </Button>
                    </Box>
                  )}
                </Box>

                {/* Income breakdown row */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5, px: 0.5 }}>
                  <Box sx={{ textAlign: 'center', flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 0.3 }}>
                      <AccountBalanceWallet sx={{ fontSize: 14, color: 'text.secondary', mr: 0.3 }} />
                      <Typography variant="caption" color="text.secondary">月收入</Typography>
                      <IconButton size="small" sx={{ p: 0, ml: 0.3 }} onClick={() => showFormula(formulas.income.title, formulas.income.lines)}>
                        <InfoOutlined sx={{ fontSize: 13, color: 'text.disabled' }} />
                      </IconButton>
                    </Box>
                    <Typography variant="body2" fontWeight={700}>¥{formatAmount(plan.monthlyIncome)}</Typography>
                  </Box>
                  <Box sx={{ textAlign: 'center', flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 0.3 }}>
                      <Savings sx={{ fontSize: 14, color: 'success.main', mr: 0.3 }} />
                      <Typography variant="caption" color="text.secondary">锁定留金</Typography>
                      <IconButton size="small" sx={{ p: 0, ml: 0.3 }} onClick={() => showFormula(formulas.savings.title, formulas.savings.lines)}>
                        <InfoOutlined sx={{ fontSize: 13, color: 'text.disabled' }} />
                      </IconButton>
                    </Box>
                    <Typography variant="body2" fontWeight={700} color="success.main">¥{formatAmount(plan.savingsTarget)}</Typography>
                  </Box>
                  <Box sx={{ textAlign: 'center', flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 0.3 }}>
                      <CreditCard sx={{ fontSize: 14, color: 'warning.main', mr: 0.3 }} />
                      <Typography variant="caption" color="text.secondary">月还款</Typography>
                      <IconButton size="small" sx={{ p: 0, ml: 0.3 }} onClick={() => showFormula(formulas.repayment.title, formulas.repayment.lines)}>
                        <InfoOutlined sx={{ fontSize: 13, color: 'text.disabled' }} />
                      </IconButton>
                    </Box>
                    <Typography variant="body2" fontWeight={700} color="warning.main">¥{formatAmount(plan.monthlyRepayment)}</Typography>
                  </Box>
                </Box>

                <Divider sx={{ mb: 1.5 }} />

                {/* Budget consumption */}
                <Box sx={{ display: 'flex', justifyContent: 'space-around', mb: 1.5 }}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Typography variant="caption" color="text.secondary">总预算</Typography>
                      <IconButton size="small" sx={{ p: 0, ml: 0.3 }} onClick={() => showFormula(formulas.totalBudget.title, formulas.totalBudget.lines)}>
                        <InfoOutlined sx={{ fontSize: 13, color: 'text.disabled' }} />
                      </IconButton>
                    </Box>
                    <Typography variant="h6" fontWeight={700}>¥{formatAmount(plan.totalBudget)}</Typography>
                  </Box>
                  <Box sx={{ textAlign: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Typography variant="caption" color="text.secondary">已花费</Typography>
                      <IconButton size="small" sx={{ p: 0, ml: 0.3 }} onClick={() => showFormula(formulas.spent.title, formulas.spent.lines)}>
                        <InfoOutlined sx={{ fontSize: 13, color: 'text.disabled' }} />
                      </IconButton>
                    </Box>
                    <Typography variant="h6" fontWeight={700} color={spentPercent > 90 ? 'error.main' : spentPercent > 70 ? 'warning.main' : 'text.primary'}>
                      ¥{formatAmount(plan.totalSpent)}
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Typography variant="caption" color="text.secondary">剩余可花</Typography>
                      <IconButton size="small" sx={{ p: 0, ml: 0.3 }} onClick={() => showFormula(formulas.remaining.title, formulas.remaining.lines)}>
                        <InfoOutlined sx={{ fontSize: 13, color: 'text.disabled' }} />
                      </IconButton>
                    </Box>
                    <Typography variant="h6" fontWeight={700} color={plan.totalRemaining > 0 ? 'success.main' : 'error.main'}>
                      ¥{formatAmount(plan.totalRemaining)}
                    </Typography>
                  </Box>
                </Box>

                {/* Budget bar: green→yellow→red as spending approaches limit */}
                <Box sx={{ position: 'relative' }}>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(spentPercent, 100)}
                    sx={{
                      height: 10, borderRadius: 5,
                      backgroundColor: 'rgba(76,175,80,0.15)',
                      '& .MuiLinearProgress-bar': {
                        borderRadius: 5,
                        backgroundColor: spentPercent <= 60 ? '#4caf50' : spentPercent <= 85 ? '#ff9800' : '#f44336',
                      },
                    }}
                  />
                  <Typography variant="caption" sx={{ position: 'absolute', right: 0, top: -16, fontWeight: 700 }}>
                    {spentPercent.toFixed(0)}%
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    {plan.startDate} ~ {plan.endDate} · {plan.weeks.length}周 · 月预算 ¥{formatAmount(plan.monthlyBudget)}
                  </Typography>
                  <IconButton size="small" sx={{ p: 0, ml: 0.3 }} onClick={() => showFormula(formulas.budget.title, formulas.budget.lines)}>
                    <InfoOutlined sx={{ fontSize: 13, color: 'text.disabled' }} />
                  </IconButton>
                </Box>

                {hasMissedWeeks && isOwnPlan && (
                  <Button
                    variant="contained"
                    color="warning"
                    size="small"
                    fullWidth
                    sx={{ mt: 1.5 }}
                    onClick={handleAdjust}
                    disabled={adjusting}
                    startIcon={adjusting ? <CircularProgress size={14} color="inherit" /> : <Warning />}
                  >
                    {adjusting ? '调整中…' : '有周预算超支，点击动态调整'}
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* AI Summary */}
            {plan.aiSummary && (
              <Card sx={{ mb: 2 }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <AutoAwesome sx={{ fontSize: 18, color: 'warning.main', mr: 0.5 }} />
                    <Typography variant="subtitle2" fontWeight={700}>AI 策略概述</Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.8 }}>
                    {plan.aiSummary}
                  </Typography>
                </CardContent>
              </Card>
            )}

            {/* Section B: Category Analysis */}
            {categoryData.length > 0 && (
              <Card sx={{ mb: 2 }}>
                <CardContent>
                  <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
                    非必要开支分析
                  </Typography>
                  <ResponsiveContainer width="100%" height={Math.max(160, categoryData.length * 40)}>
                    <BarChart data={categoryData} layout="vertical" margin={{ left: 10, right: 20, top: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={(v) => `¥${v}`} />
                      <YAxis type="category" dataKey="name" width={65} tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(v) => `¥${formatAmount(v)}`} />
                      <Legend />
                      <Bar dataKey="当前月均" fill="#ef5350" barSize={12} radius={[0, 4, 4, 0]} />
                      <Bar dataKey="建议上限" fill="#4caf50" barSize={12} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>

                  {/* Category classification chips */}
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1.5 }}>
                    {(plan.categoryAnalysis || []).map((c) => {
                      const cl = CLASSIFICATION_LABELS[c.classification] || CLASSIFICATION_LABELS['non-essential']
                      return (
                        <Chip
                          key={c.category}
                          label={`${c.category} · ${cl.label}`}
                          size="small"
                          sx={{ bgcolor: cl.color + '20', color: cl.color, fontWeight: 600, fontSize: 11 }}
                        />
                      )
                    })}
                  </Box>

                  {/* Top patterns */}
                  {(plan.categoryAnalysis || []).some((c) => c.topPatterns?.length > 0) && (
                    <Box sx={{ mt: 1.5 }}>
                      <Typography variant="caption" fontWeight={700} color="text.secondary">
                        高频消费模式
                      </Typography>
                      {(plan.categoryAnalysis || [])
                        .filter((c) => c.topPatterns?.length > 0)
                        .slice(0, 5)
                        .map((c) => (
                          <Typography key={c.category} variant="caption" display="block" color="text.secondary" sx={{ mt: 0.3 }}>
                            {c.category}：{c.topPatterns.join('、')}
                          </Typography>
                        ))}
                    </Box>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Section D: Weekly Budget vs Spending Chart */}
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
                  每周预算 vs 实际花费
                </Typography>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={weeklyChartData} margin={{ left: 0, right: 10, top: 5, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `¥${v}`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => v !== null ? `¥${formatAmount(v)}` : '—'} />
                    <Legend />
                    <Bar dataKey="预算" fill="#90caf9" barSize={14} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="实际花费" fill="#ef5350" barSize={14} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Section C: Weekly Timeline */}
            <Card sx={{ mb: 2 }}>
              <CardContent sx={{ px: 1.5 }}>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5, px: 0.5 }}>
                  周度执行计划
                </Typography>
                {plan.weeks.map((w) => {
                  const cfg = STATUS_CONFIG[w.status] || STATUS_CONFIG.UPCOMING
                  const isExpanded = expandedWeek === w.weekNumber
                  const isCurrentWeek = w.status === 'IN_PROGRESS'
                  const spentPct = w.budgetAmount > 0 ? Math.min(100, (w.actualSpending / w.budgetAmount) * 100) : 0

                  return (
                    <Box
                      key={w.weekNumber}
                      sx={{
                        mb: 1,
                        border: '1px solid',
                        borderColor: isCurrentWeek ? 'primary.main' : 'divider',
                        borderRadius: 2,
                        overflow: 'hidden',
                        bgcolor: isCurrentWeek ? 'primary.50' : 'transparent',
                      }}
                    >
                      {/* Week header */}
                      <Box
                        sx={{
                          display: 'flex', alignItems: 'center', px: 1.5, py: 1,
                          cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' },
                        }}
                        onClick={() => setExpandedWeek(isExpanded ? null : w.weekNumber)}
                      >
                        <Box sx={{ mr: 1, color: `${cfg.color}.main` }}>{cfg.icon}</Box>
                        <Box sx={{ flex: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <Typography variant="body2" fontWeight={700}>
                              第{w.weekNumber}周
                            </Typography>
                            <Chip label={cfg.label} size="small" color={cfg.color} sx={{ height: 20, fontSize: 11 }} />
                            {w.isAdjusted && (
                              <Chip label="已调整" size="small" variant="outlined" color="warning" sx={{ height: 20, fontSize: 11 }} />
                            )}
                          </Box>
                          <Typography variant="caption" color="text.secondary">
                            {w.startDate} ~ {w.endDate}
                          </Typography>
                        </Box>
                        <Box sx={{ textAlign: 'right', mr: 0.5 }}>
                          {w.status !== 'UPCOMING' ? (
                            <>
                              <Typography variant="body2" fontWeight={700} color={w.remaining >= 0 ? 'success.main' : 'error.main'}>
                                剩余 ¥{formatAmount(w.remaining)}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                花了 ¥{formatAmount(w.actualSpending)} / ¥{formatAmount(w.budgetAmount)}
                              </Typography>
                            </>
                          ) : (
                            <Typography variant="body2" fontWeight={700}>
                              预算 ¥{formatAmount(w.budgetAmount)}
                            </Typography>
                          )}
                          {w.isAdjusted && w.originalBudget !== null && (
                            <Typography variant="caption" color="text.disabled" sx={{ textDecoration: 'line-through', display: 'block' }}>
                              原 ¥{formatAmount(w.originalBudget)}
                            </Typography>
                          )}
                        </Box>
                        {isExpanded ? <ExpandLess sx={{ fontSize: 20 }} /> : <ExpandMore sx={{ fontSize: 20 }} />}
                      </Box>

                      {/* Expanded content */}
                      <Collapse in={isExpanded}>
                        <Box sx={{ px: 1.5, pb: 1.5 }}>
                          <Divider sx={{ mb: 1 }} />

                          {/* AI advice */}
                          {w.aiAdvice && (
                            <Box sx={{ mb: 1.5, p: 1, bgcolor: 'warning.50', borderRadius: 1, border: '1px solid', borderColor: 'warning.200' }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                                <AutoAwesome sx={{ fontSize: 14, color: 'warning.main', mr: 0.5 }} />
                                <Typography variant="caption" fontWeight={700} color="warning.main">
                                  AI 建议
                                </Typography>
                              </Box>
                              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                                {w.aiAdvice}
                              </Typography>
                            </Box>
                          )}

                          {/* Budget consumption bar */}
                          <Box sx={{ mb: 1.5 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                              <Typography variant="caption" color="text.secondary">
                                周预算：¥{formatAmount(w.budgetAmount)}
                              </Typography>
                              {w.status !== 'UPCOMING' && (
                                <Typography variant="caption" fontWeight={700} color={w.remaining >= 0 ? 'success.main' : 'error.main'}>
                                  {w.remaining >= 0 ? `还可花 ¥${formatAmount(w.remaining)}` : `超支 ¥${formatAmount(-w.remaining)}`}
                                </Typography>
                              )}
                            </Box>
                            {w.status !== 'UPCOMING' && (
                              <LinearProgress
                                variant="determinate"
                                value={Math.min(spentPct, 100)}
                                sx={{
                                  height: 8, borderRadius: 4,
                                  bgcolor: 'rgba(76,175,80,0.12)',
                                  '& .MuiLinearProgress-bar': {
                                    borderRadius: 4,
                                    bgcolor: spentPct <= 60 ? '#4caf50' : spentPct <= 90 ? '#ff9800' : '#f44336',
                                  },
                                }}
                              />
                            )}
                          </Box>

                          {/* Category reductions */}
                          {w.reductions && w.reductions.length > 0 && (
                            <Box>
                              <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                                类别控制目标
                              </Typography>
                              {w.reductions.map((r) => {
                                const pct = r.weeklyLimit > 0 ? Math.min(100, (r.actualSpent / r.weeklyLimit) * 100) : 0
                                const overBudget = r.actualSpent > r.weeklyLimit
                                return (
                                  <Box key={r.id} sx={{ mb: 1 }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <Typography variant="caption" fontWeight={600}>{r.category}</Typography>
                                      <Typography variant="caption" color={overBudget ? 'error.main' : 'text.secondary'}>
                                        ¥{formatAmount(r.actualSpent)} / ¥{formatAmount(r.weeklyLimit)}
                                      </Typography>
                                    </Box>
                                    <LinearProgress
                                      variant="determinate"
                                      value={Math.min(pct, 100)}
                                      sx={{
                                        height: 6, borderRadius: 3, mt: 0.3,
                                        bgcolor: 'grey.200',
                                        '& .MuiLinearProgress-bar': {
                                          borderRadius: 3,
                                          bgcolor: pct <= 60 ? '#4caf50' : pct <= 90 ? '#ff9800' : '#f44336',
                                        },
                                      }}
                                    />
                                    {r.description && (
                                      <Typography variant="caption" color="text.disabled" sx={{ mt: 0.2, display: 'block', fontSize: 11 }}>
                                        💡 {r.description}
                                      </Typography>
                                    )}
                                  </Box>
                                )
                              })}
                            </Box>
                          )}
                        </Box>
                      </Collapse>
                    </Box>
                  )
                })}
              </CardContent>
            </Card>
          </>
        )}
      </Box>

      <GeneratePlanDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onGenerated={handleGenerated}
      />

      {/* 公式说明弹窗 */}
      <Dialog open={!!formulaDialog} onClose={() => setFormulaDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, pb: 0.5, fontSize: 16 }}>
          {formulaDialog?.title}
        </DialogTitle>
        <DialogContent>
          {formulaDialog?.lines.map((line, i) => (
            <Typography key={i} variant="body2" color="text.secondary" sx={{ lineHeight: 2, fontFamily: 'monospace', fontSize: 13 }}>
              {line}
            </Typography>
          ))}
        </DialogContent>
      </Dialog>
    </Box>
  )
}
