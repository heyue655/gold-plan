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
