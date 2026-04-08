import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Card,
  CardContent,
  Avatar,
  CircularProgress,
  Alert,
  Divider,
  Button,
  LinearProgress,
  IconButton,
  Badge,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Tab,
  Tabs,
} from '@mui/material'
import {
  AccountCircle,
  Logout,
  Link as LinkIcon,
  Savings,
  Edit,
  Delete,
  AutoAwesome,
  TrendingUp,
  TrendingDown,
  TrendingFlat,
} from '@mui/icons-material'
import BindingDialog from '../components/BindingDialog'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { formatAmount } from '../utils/format'

export default function MyPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [bindingOpen, setBindingOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [members, setMembers] = useState([])

  // Goals state
  const [goals, setGoals] = useState(null)
  const [goalDialogOpen, setGoalDialogOpen] = useState(false)
  const [goalTab, setGoalTab] = useState(0)
  const [personalAmount, setPersonalAmount] = useState('')
  const [personalNote, setPersonalNote] = useState('')
  const [familyAmount, setFamilyAmount] = useState('')
  const [familyNote, setFamilyNote] = useState('')
  const [goalSaving, setGoalSaving] = useState(false)
  const [goalError, setGoalError] = useState('')

  // AI 分析状态
  const [aiAnalysis, setAiAnalysis] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [aiGeneratedAt, setAiGeneratedAt] = useState('')
  const [aiPending, setAiPending] = useState(false) // 已提交分析请求，等待结果
  const [aiComparison, setAiComparison] = useState(null)

  // 页面加载时拉取最近一次分析记录
  useEffect(() => {
    api.get('/ai/last').then(({ data }) => {
      if (data.record) {
        setAiAnalysis(data.record.content)
        setAiGeneratedAt(data.record.createdAt)
      }
      if (data.comparison) setAiComparison(data.comparison)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    api.get('/family').then(({ data }) => {
      setPendingCount(data.pendingReceived.length)
      setMembers(data.members)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { data } = await api.get('/stats')
        setStats(data)
      } catch (err) {
        setError(err.response?.data?.message || '加载失败')
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [])

  const fetchGoals = useCallback(() => {
    api.get('/goals').then(({ data }) => setGoals(data)).catch(() => {})
  }, [])

  useEffect(() => {
    fetchGoals()
  }, [fetchGoals])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const openGoalDialog = () => {
    setGoalError('')
    setPersonalAmount(goals?.personal ? String(parseFloat(goals.personal.amount)) : '')
    setPersonalNote(goals?.personal?.note || '')
    setFamilyAmount(goals?.family && goals?.familyGoalIsOwn ? String(parseFloat(goals.family.amount)) : '')
    setFamilyNote(goals?.family && goals?.familyGoalIsOwn ? (goals.family.note || '') : '')
    setGoalTab(0)
    setGoalDialogOpen(true)
  }

  const saveGoal = async () => {
    setGoalError('')
    setGoalSaving(true)
    try {
      if (goalTab === 0) {
        if (!personalAmount || isNaN(parseFloat(personalAmount)) || parseFloat(personalAmount) <= 0) {
          setGoalError('请输入有效的目标金额')
          setGoalSaving(false)
          return
        }
        await api.put('/goals/personal', { amount: personalAmount, note: personalNote })
      } else {
        if (!familyAmount || isNaN(parseFloat(familyAmount)) || parseFloat(familyAmount) <= 0) {
          setGoalError('请输入有效的目标金额')
          setGoalSaving(false)
          return
        }
        await api.put('/goals/family', { amount: familyAmount, note: familyNote })
      }
      fetchGoals()
      setGoalDialogOpen(false)
    } catch (err) {
      setGoalError(err.response?.data?.message || '保存失败')
    } finally {
      setGoalSaving(false)
    }
  }

  const deleteGoal = async (scope) => {
    try {
      await api.delete(`/goals/${scope}`)
      fetchGoals()
    } catch {
      // ignore
    }
  }

  // Derived calculations
  const liujin = stats
    ? (stats.total_income ?? 0) - (stats.total_ledger_expense ?? 0) - (stats.total_paid ?? 0)
    : 0

  const personalRate = goals?.personal
    ? Math.min((liujin / parseFloat(goals.personal.amount)) * 100, 100)
    : null

  const familyLiujin = goals?.familyLiu ?? null
  const familyRate =
    goals?.family && familyLiujin !== null
      ? Math.min((familyLiujin / parseFloat(goals.family.amount)) * 100, 100)
      : null

  const handleAiAnalyze = async () => {
    setAiLoading(true)
    setAiError('')
    try {
      await api.post('/ai/analyze')
      setAiPending(true)
    } catch (err) {
      setAiError(err.response?.data?.message || 'AI 分析失败，请稍后重试')
    } finally {
      setAiLoading(false)
    }
  }

  const handleAiRefresh = async () => {
    setAiLoading(true)
    setAiError('')
    try {
      const { data } = await api.get('/ai/last')
      if (data.record) {
        setAiAnalysis(data.record.content)
        setAiGeneratedAt(data.record.createdAt)
        setAiComparison(data.comparison || null)
        setAiPending(false)
      }
    } catch {
      // 静默失败
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <Box>
      <AppBar position="sticky" elevation={0} sx={{ backgroundColor: 'primary.main' }}>
        <Toolbar>
          <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>
            我的
          </Typography>
          <Button
            color="inherit"
            startIcon={<Logout />}
            onClick={handleLogout}
            sx={{ fontSize: '0.8rem' }}
          >
            退出
          </Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ px: 2, py: 2 }}>
        {/* 用户信息 */}
        <Card sx={{ mb: 2 }}>
          <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, position: 'relative' }}>
            <Avatar sx={{ bgcolor: 'primary.main', width: 52, height: 52 }}>
              <AccountCircle sx={{ fontSize: 32 }} />
            </Avatar>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h6" fontWeight={700}>
                {user?.username}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {user?.email}
              </Typography>
              {members.length > 0 && (
                <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                  {members.map((m) => (
                    <Chip
                      key={m.id}
                      label={m.username}
                      size="small"
                      color="primary"
                      variant="outlined"
                      icon={<LinkIcon sx={{ fontSize: '14px !important' }} />}
                    />
                  ))}
                </Box>
              )}
            </Box>
            <IconButton
              onClick={() => setBindingOpen(true)}
              sx={{ position: 'absolute', top: 8, right: 8 }}
              aria-label="家庭绑定"
              size="small"
            >
              <Badge badgeContent={pendingCount} color="error">
                <LinkIcon color="action" />
              </Badge>
            </IconButton>
          </CardContent>
        </Card>

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
            <CircularProgress />
          </Box>
        )}

        {error && <Alert severity="error">{error}</Alert>}

        {stats && (
          <>
            {/* 累计三卡片 */}
            <Box sx={{ display: 'flex', gap: 1.5, mb: 1.5 }}>
              <Card sx={{ flex: 1, borderRadius: 2, border: '1px solid', borderColor: 'success.200' }}>
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 }, textAlign: 'center' }}>
                  <Typography variant="caption" color="text.secondary" display="block">累计收入</Typography>
                  <Typography variant="body2" fontWeight={700} color="success.main" sx={{ mt: 0.25, wordBreak: 'break-all' }}>
                    ¥{formatAmount(stats.total_income ?? 0)}
                  </Typography>
                </CardContent>
              </Card>
              <Card sx={{ flex: 1, borderRadius: 2, border: '1px solid', borderColor: 'warning.200' }}>
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 }, textAlign: 'center' }}>
                  <Typography variant="caption" color="text.secondary" display="block">累计支出</Typography>
                  <Typography variant="body2" fontWeight={700} color="warning.dark" sx={{ mt: 0.25, wordBreak: 'break-all' }}>
                    ¥{formatAmount(stats.total_ledger_expense ?? 0)}
                  </Typography>
                </CardContent>
              </Card>
              <Card sx={{ flex: 1, borderRadius: 2, border: '1px solid', borderColor: 'primary.200' }}>
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 }, textAlign: 'center' }}>
                  <Typography variant="caption" color="text.secondary" display="block">累计还款</Typography>
                  <Typography variant="body2" fontWeight={700} color="primary.main" sx={{ mt: 0.25, wordBreak: 'break-all' }}>
                    ¥{formatAmount(stats.total_paid)}
                  </Typography>
                </CardContent>
              </Card>
            </Box>

            {/* 累计留金 — 个人；有绑定成员时并排显示家庭留金 */}
            {members.length > 0 ? (
              <Box sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
                {/* 个人留金 */}
                <Card
                  sx={{
                    flex: 1,
                    background: liujin >= 0
                      ? 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)'
                      : 'linear-gradient(135deg, #fce4ec 0%, #f8bbd0 100%)',
                    border: '1.5px solid',
                    borderColor: liujin >= 0 ? 'primary.300' : 'error.300',
                    borderRadius: 3,
                  }}
                >
                  <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                      <Savings sx={{ color: liujin >= 0 ? 'primary.main' : 'error.main', fontSize: 18 }} />
                      <Typography variant="caption" fontWeight={600} color="text.secondary">
                        个人留金
                      </Typography>
                    </Box>
                    <Typography
                      variant="h6"
                      fontWeight={800}
                      color={liujin >= 0 ? 'primary.main' : 'error.main'}
                      sx={{ wordBreak: 'break-all' }}
                    >
                      ¥{formatAmount(liujin)}
                    </Typography>
                  </CardContent>
                </Card>

                {/* 家庭留金 */}
                {(() => {
                  const fl = goals?.familyLiu ?? null
                  const flColor = fl === null ? 'text.secondary' : fl >= 0 ? 'secondary.main' : 'error.main'
                  const flBg = fl === null || fl >= 0
                    ? 'linear-gradient(135deg, #f3e5f5 0%, #e1bee7 100%)'
                    : 'linear-gradient(135deg, #fce4ec 0%, #f8bbd0 100%)'
                  const flBorder = fl === null || fl >= 0 ? 'secondary.300' : 'error.300'
                  return (
                    <Card
                      sx={{
                        flex: 1,
                        background: flBg,
                        border: '1.5px solid',
                        borderColor: flBorder,
                        borderRadius: 3,
                      }}
                    >
                      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                          <Savings sx={{ color: fl !== null && fl >= 0 ? 'secondary.main' : 'error.main', fontSize: 18 }} />
                          <Typography variant="caption" fontWeight={600} color="text.secondary">
                            家庭留金
                          </Typography>
                        </Box>
                        <Typography
                          variant="h6"
                          fontWeight={800}
                          color={flColor}
                          sx={{ wordBreak: 'break-all' }}
                        >
                          {fl === null ? '—' : `¥${formatAmount(fl)}`}
                        </Typography>
                      </CardContent>
                    </Card>
                  )
                })()}
              </Box>
            ) : (
              /* 无家庭成员时显示原来的大卡片 */
              <Card
                sx={{
                  mb: 2,
                  background: liujin >= 0
                    ? 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)'
                    : 'linear-gradient(135deg, #fce4ec 0%, #f8bbd0 100%)',
                  border: '1.5px solid',
                  borderColor: liujin >= 0 ? 'primary.300' : 'error.300',
                  borderRadius: 3,
                }}
              >
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Savings sx={{ color: liujin >= 0 ? 'primary.main' : 'error.main', fontSize: 22 }} />
                    <Typography variant="body2" fontWeight={600} color="text.secondary">
                      累计留金（收入−支出−还款）
                    </Typography>
                  </Box>
                  <Typography
                    variant="h4"
                    fontWeight={800}
                    color={liujin >= 0 ? 'primary.main' : 'error.main'}
                    sx={{ letterSpacing: -1 }}
                  >
                    ¥{formatAmount(liujin)}
                  </Typography>
                </CardContent>
              </Card>
            )}

            {/* 留金目标 */}
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle1" fontWeight={700} sx={{ flex: 1 }}>
                    留金目标
                  </Typography>
                  <IconButton size="small" onClick={openGoalDialog} aria-label="设置目标">
                    <Edit fontSize="small" />
                  </IconButton>
                </Box>
                <Divider sx={{ mb: 1.5 }} />

                {/* 个人目标 */}
                <Typography variant="body2" fontWeight={600} color="primary.main" sx={{ mb: 0.5 }}>
                  个人目标
                </Typography>
                {goals?.personal ? (
                  <Box sx={{ mb: 1.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="body2" color="text.secondary">
                        目标：¥{formatAmount(parseFloat(goals.personal.amount))}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography variant="body2" fontWeight={700} color={personalRate >= 100 ? 'success.main' : 'primary.main'}>
                          {Math.max(personalRate ?? 0, 0).toFixed(1)}%
                        </Typography>
                        <IconButton size="small" onClick={() => deleteGoal('personal')} sx={{ p: 0.25 }}>
                          <Delete fontSize="inherit" color="error" />
                        </IconButton>
                      </Box>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={Math.max(personalRate ?? 0, 0)}
                      sx={{
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: '#e3f2fd',
                        '& .MuiLinearProgress-bar': {
                          backgroundColor: personalRate >= 100 ? '#4caf50' : '#1976d2',
                          borderRadius: 4,
                        },
                      }}
                    />
                    {goals.personal.note && (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                        {goals.personal.note}
                      </Typography>
                    )}
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.disabled" sx={{ mb: 1.5 }}>
                    尚未设置个人目标
                  </Typography>
                )}

                {/* 家庭目标 — 仅有绑定成员时显示 */}
                {goals?.hasFamilyMembers && (
                  <>
                    <Typography variant="body2" fontWeight={600} color="secondary.main" sx={{ mb: 0.5 }}>
                      家庭目标
                    </Typography>
                    {goals?.family ? (
                      <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography variant="body2" color="text.secondary">
                            目标：¥{formatAmount(parseFloat(goals.family.amount))}
                          </Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Typography variant="body2" fontWeight={700} color={familyRate >= 100 ? 'success.main' : 'secondary.main'}>
                              {Math.max(familyRate ?? 0, 0).toFixed(1)}%
                            </Typography>
                            {goals.familyGoalIsOwn && (
                              <IconButton size="small" onClick={() => deleteGoal('family')} sx={{ p: 0.25 }}>
                                <Delete fontSize="inherit" color="error" />
                              </IconButton>
                            )}
                          </Box>
                        </Box>
                        <LinearProgress
                          variant="determinate"
                          value={Math.max(familyRate ?? 0, 0)}
                          sx={{
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: '#f3e5f5',
                            '& .MuiLinearProgress-bar': {
                              backgroundColor: familyRate >= 100 ? '#4caf50' : '#9c27b0',
                              borderRadius: 4,
                            },
                          }}
                        />
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                          家庭累计留金：¥{formatAmount(Math.max(familyLiujin ?? 0, 0))}
                          {goals.family.note && `　${goals.family.note}`}
                        </Typography>
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.disabled">
                        尚未设置家庭目标
                      </Typography>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
            {/* AI 财务分析 */}
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <AutoAwesome sx={{ color: 'warning.main', mr: 1, fontSize: 20 }} />
                  <Typography variant="subtitle1" fontWeight={700} sx={{ flex: 1 }}>
                    AI 财务分析
                  </Typography>
                  <Button
                    size="small"
                    variant={aiAnalysis && !aiPending ? 'outlined' : 'contained'}
                    onClick={handleAiAnalyze}
                    disabled={aiLoading}
                    startIcon={aiLoading ? <CircularProgress size={13} color="inherit" /> : <AutoAwesome />}
                    sx={{ minWidth: 96 }}
                  >
                    {aiLoading ? '提交中…' : aiAnalysis ? '重新分析' : '开始分析'}
                  </Button>
                </Box>
                <Divider sx={{ mb: 1.5 }} />

                {/* 与上次分析的对比卡 */}
                {aiComparison && (() => {
                  const c = aiComparison
                  const isImproved = c.trend === 'improved'
                  const isWorsened = c.trend === 'worsened'
                  const trendColor = isImproved ? 'success.main' : isWorsened ? 'error.main' : 'text.secondary'
                  const trendBg = isImproved ? '#e8f5e9' : isWorsened ? '#ffebee' : '#f5f5f5'
                  const TrendIcon = isImproved ? TrendingUp : isWorsened ? TrendingDown : TrendingFlat
                  const trendLabel = isImproved ? '财务状况好转 ↑' : isWorsened ? '财务状况恶化 ↓' : '财务状况持平'
                  const fmt = (v) => (v >= 0 ? '+' : '') + formatAmount(v)
                  return (
                    <Box sx={{ mb: 1.5, p: 1.5, bgcolor: trendBg, borderRadius: 2, border: '1px solid', borderColor: isImproved ? 'success.200' : isWorsened ? 'error.200' : 'grey.300' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
                        <TrendIcon sx={{ color: trendColor, fontSize: 18 }} />
                        <Typography variant="body2" fontWeight={700} color={trendColor}>{trendLabel}</Typography>
                        <Typography variant="caption" color="text.disabled" sx={{ ml: 'auto' }}>
                          对比 {new Date(c.prevCreatedAt).toLocaleDateString('zh-CN')}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
                        {[
                          { label: '净留金', diff: c.netBalanceDiff, positive: c.netBalanceDiff > 0 },
                          { label: '总收入', diff: c.totalIncomeDiff, positive: c.totalIncomeDiff > 0 },
                          { label: '日常支出', diff: c.totalExpenseDiff, positive: c.totalExpenseDiff < 0 },
                          { label: '信用卡还款', diff: c.repaymentDiff, positive: c.repaymentDiff < 0 },
                        ].map(({ label, diff, positive }) => (
                          <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="caption" color="text.secondary">{label}</Typography>
                            <Typography variant="caption" fontWeight={700}
                              color={diff === 0 ? 'text.secondary' : positive ? 'success.main' : 'error.main'}>
                              {diff === 0 ? '—' : `¥${fmt(diff)}`}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  )
                })()}

                {aiError && <Alert severity="error" sx={{ mb: 1 }}>{aiError}</Alert>}

                {/* 分析中提示 + 刷新按钮 */}
                {aiPending && (
                  <Alert
                    severity="info"
                    sx={{ mb: 1.5 }}
                    action={
                      <Button
                        size="small"
                        color="info"
                        onClick={handleAiRefresh}
                        disabled={aiLoading}
                        startIcon={aiLoading ? <CircularProgress size={12} color="inherit" /> : null}
                      >
                        刷新结果
                      </Button>
                    }
                  >
                    分析中，请稍候查看分析结果
                  </Alert>
                )}
                {!aiAnalysis && !aiLoading && !aiError && (
                  <Typography variant="body2" color="text.disabled" sx={{ textAlign: 'center', py: 2 }}>
                    点击「开始分析」，AI 将根据您近12个月的收支数据生成个性化建议
                  </Typography>
                )}
                {aiLoading && !aiAnalysis && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                    <CircularProgress size={32} />
                  </Box>
                )}
                {aiAnalysis && (
                  <Box>
                    {aiAnalysis.split('\n').map((line, i) => {
                      if (line.startsWith('## ') || line.startsWith('# ')) {
                        const text = line.replace(/^#+\s*/, '')
                        return (
                          <Typography key={i} variant="body2" fontWeight={700} sx={{ mt: 1.5, mb: 0.5, color: 'primary.main' }}>
                            {text.replace(/\*\*/g, '')}
                          </Typography>
                        )
                      }
                      if (line.trim() === '') return <Box key={i} sx={{ height: 6 }} />
                      // 渲染行内加粗 **text**
                      const parts = line.split(/(\*\*.*?\*\*)/g)
                      return (
                        <Typography key={i} variant="body2" sx={{ lineHeight: 1.9 }}>
                          {parts.map((part, j) =>
                            /^\*\*(.*)\*\*$/.test(part)
                              ? <strong key={j}>{part.slice(2, -2)}</strong>
                              : part
                          )}
                        </Typography>
                      )
                    })}
                    {aiGeneratedAt && (
                      <Typography variant="caption" color="text.disabled" sx={{ mt: 1.5, display: 'block' }}>
                        生成于 {new Date(aiGeneratedAt).toLocaleString('zh-CN')}
                      </Typography>
                    )}
                  </Box>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </Box>

      {/* 家庭绑定弹窗 */}
      <BindingDialog
        open={bindingOpen}
        onClose={() => setBindingOpen(false)}
        onMembersChange={(m) => {
          setMembers(m)
          setPendingCount(0)
        }}
      />

      {/* 留金目标设置弹窗 */}
      <Dialog open={goalDialogOpen} onClose={() => setGoalDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>设置留金目标</DialogTitle>
        <DialogContent>
          {goals?.hasFamilyMembers && (
            <Tabs
              value={goalTab}
              onChange={(_, v) => { setGoalTab(v); setGoalError('') }}
              sx={{ mb: 2 }}
            >
              <Tab label="个人目标" />
              <Tab label="家庭目标" />
            </Tabs>
          )}
          {goalTab === 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                label="目标留金金额（元）"
                type="number"
                value={personalAmount}
                onChange={(e) => setPersonalAmount(e.target.value)}
                fullWidth
                inputProps={{ min: 0 }}
              />
              <TextField
                label="备注（可选）"
                value={personalNote}
                onChange={(e) => setPersonalNote(e.target.value)}
                fullWidth
              />
            </Box>
          )}
          {goalTab === 1 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {goals?.family && !goals?.familyGoalIsOwn && (
                <Alert severity="info">家庭目标由其他成员设置，您可查看但不能修改</Alert>
              )}
              <TextField
                label="家庭目标留金金额（元）"
                type="number"
                value={familyAmount}
                onChange={(e) => setFamilyAmount(e.target.value)}
                fullWidth
                inputProps={{ min: 0 }}
                disabled={goals?.family && !goals?.familyGoalIsOwn}
              />
              <TextField
                label="备注（可选）"
                value={familyNote}
                onChange={(e) => setFamilyNote(e.target.value)}
                fullWidth
                disabled={goals?.family && !goals?.familyGoalIsOwn}
              />
            </Box>
          )}
          {goalError && <Alert severity="error" sx={{ mt: 2 }}>{goalError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGoalDialogOpen(false)}>取消</Button>
          {!(goalTab === 1 && goals?.family && !goals?.familyGoalIsOwn) && (
            <Button variant="contained" onClick={saveGoal} disabled={goalSaving}>
              {goalSaving ? '保存中…' : '保存'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  )
}
