import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  CircularProgress,
  Alert,
  Chip,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from '@mui/material'
import {
  ChevronLeft,
  ChevronRight,
  Add,
} from '@mui/icons-material'
import api from '../api/axios'
import RepaymentCard from '../components/RepaymentCard'
import AddPlanDialog from '../components/AddPlanDialog'
import EditPlanDialog from '../components/EditPlanDialog'
import { formatAmount } from '../utils/format'
import { useAuth } from '../context/AuthContext'

const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

function getToday() {
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() }
}

export default function HomePage() {
  const { user } = useAuth()
  const today = getToday()
  const [current, setCurrent] = useState({ year: today.year, month: today.month })
  const [repayments, setRepayments] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // 家庭成员
  const [familyMembers, setFamilyMembers] = useState([])
  const [scope, setScope] = useState('mine') // 'all' | 'mine' | String(memberId)

  useEffect(() => {
    api.get('/family').then(({ data }) => setFamilyMembers(data.members)).catch(() => {})
  }, [])

  const isReadOnly = scope !== 'mine'

  const fetchRepayments = useCallback(async (year, month, sc) => {
    setLoading(true)
    setError('')
    try {
      const params = { year, month }
      if (sc === 'all') params.scope = 'all'
      else if (sc !== 'mine') params.userId = parseInt(sc, 10)
      const { data } = await api.get('/repayments', { params })
      setRepayments(data)
    } catch (err) {
      setError(err.response?.data?.message || '加载失败，请刷新重试')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRepayments(current.year, current.month, scope)
  }, [current, scope, fetchRepayments])

  const handlePrevMonth = () => {
    setCurrent((prev) => {
      if (prev.month === 1) return { year: prev.year - 1, month: 12 }
      return { ...prev, month: prev.month - 1 }
    })
  }

  const handleNextMonth = () => {
    setCurrent((prev) => {
      if (prev.month === 12) return { year: prev.year + 1, month: 1 }
      return { ...prev, month: prev.month + 1 }
    })
  }

  const handleToggle = async (repayment) => {
    try {
      const { data } = await api.patch(`/repayments/${repayment.id}/toggle`)
      setRepayments((prev) => prev.map((r) => (r.id === data.id ? data : r)))
    } catch {
      // 静默失败
    }
  }

  const handlePlanAdded = () => {
    fetchRepayments(current.year, current.month, scope)
  }

  const handleEdit = (repayment) => {
    setEditTarget(repayment)
  }

  const handleEditSuccess = () => {
    setEditTarget(null)
    fetchRepayments(current.year, current.month, scope)
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    setDeleteLoading(true)
    try {
      await api.delete(`/plans/${deleteTarget.plan_id}`)
      setDeleteTarget(null)
      fetchRepayments(current.year, current.month, scope)
    } catch (err) {
      setError(err.response?.data?.message || '删除失败，请稍后重试')
      setDeleteTarget(null)
    } finally {
      setDeleteLoading(false)
    }
  }

  const isCurrentMonth =
    current.year === today.year && current.month === today.month

  const paid = repayments.filter((r) => r.is_paid)
  const unpaid = repayments.filter((r) => !r.is_paid)
  const paidAmount = paid.reduce((sum, r) => sum + parseFloat(r.amount), 0)
  const totalAmount = repayments.reduce((sum, r) => sum + parseFloat(r.amount), 0)
  const progress = totalAmount > 0 ? (paidAmount / totalAmount) * 100 : 0

  return (
    <Box>
      <AppBar position="sticky" elevation={0} sx={{ backgroundColor: 'primary.main' }}>
        <Toolbar>
          <IconButton color="inherit" onClick={handlePrevMonth} aria-label="上个月" size="large">
            <ChevronLeft />
          </IconButton>
          <Box sx={{ flex: 1, textAlign: 'center' }}>
            <Typography variant="h6" fontWeight={700}>
              {current.year}年{MONTH_NAMES[current.month - 1]}
            </Typography>
            {isCurrentMonth && (
              <Typography variant="caption" sx={{ opacity: 0.85 }}>
                本月
              </Typography>
            )}
          </Box>
          <IconButton color="inherit" onClick={handleNextMonth} aria-label="下个月" size="large">
            <ChevronRight />
          </IconButton>
        </Toolbar>

        {/* 成员选择器 — 有绑定成员时显示 */}
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
              { key: 'mine', label: '仅看我的' },
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

        {/* 进度条 */}
        {repayments.length > 0 && (
          <Box sx={{ px: 2, pb: 1.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.9)' }}>
                已还 ¥{formatAmount(paidAmount)}
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.9)' }}>
                共 ¥{formatAmount(totalAmount)}
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={progress}
              sx={{
                height: 6,
                borderRadius: 3,
                backgroundColor: 'rgba(255,255,255,0.3)',
                '& .MuiLinearProgress-bar': { backgroundColor: '#fff' },
              }}
            />
          </Box>
        )}
      </AppBar>

      <Box sx={{ px: 2, py: 2 }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
            <CircularProgress />
          </Box>
        )}

        {!loading && error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {!loading && !error && repayments.length === 0 && (
          <Box sx={{ textAlign: 'center', mt: 8, color: 'text.secondary' }}>
            <Typography variant="h6" gutterBottom>
              {scope === 'all' ? '全部成员本月均无还款计划' : scope !== 'mine' ? '该成员本月暂无还款计划' : '本月暂无还款计划'}
            </Typography>
            {!isReadOnly && (
              <Typography variant="body2">
                点击"待还款"前的 + 按钮添加还款计划
              </Typography>
            )}
          </Box>
        )}

        {!loading && !error && (
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              {/* + 按钮只在查看自己时显示 */}
              {!isReadOnly && (
                <IconButton
                  size="small"
                  onClick={() => setAddOpen(true)}
                  aria-label="添加还款计划"
                  sx={{
                    bgcolor: 'primary.main',
                    color: '#fff',
                    width: 26,
                    height: 26,
                    '&:hover': { bgcolor: 'primary.dark' },
                  }}
                >
                  <Add sx={{ fontSize: 16 }} />
                </IconButton>
              )}
              <Typography variant="subtitle2" color="text.secondary" fontWeight={600}>
                待还款
              </Typography>
              {unpaid.length > 0 && <Chip label={unpaid.length} size="small" color="error" />}
            </Box>
            {unpaid.map((r) => (
              <RepaymentCard
                key={r.id}
                repayment={r}
                today={today}
                onToggle={handleToggle}
                onEdit={handleEdit}
                onDelete={setDeleteTarget}
                readOnly={isReadOnly}
                ownerName={scope === 'all' && r.user_id !== user?.id ? r.username : undefined}
              />
            ))}
          </Box>
        )}

        {!loading && paid.length > 0 && (
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Typography variant="subtitle2" color="text.secondary" fontWeight={600}>
                已还款
              </Typography>
              <Chip label={paid.length} size="small" color="success" />
            </Box>
            {paid.map((r) => (
              <RepaymentCard
                key={r.id}
                repayment={r}
                today={today}
                onToggle={handleToggle}
                onEdit={handleEdit}
                onDelete={setDeleteTarget}
                readOnly={isReadOnly}
                ownerName={scope === 'all' && r.user_id !== user?.id ? r.username : undefined}
              />
            ))}
          </Box>
        )}
      </Box>

      {!isReadOnly && (
        <>
          <AddPlanDialog
            open={addOpen}
            onClose={() => setAddOpen(false)}
            onSuccess={handlePlanAdded}
          />
          <EditPlanDialog
            open={Boolean(editTarget)}
            plan={editTarget}
            onClose={() => setEditTarget(null)}
            onSuccess={handleEditSuccess}
          />
          <Dialog
            open={Boolean(deleteTarget)}
            onClose={() => !deleteLoading && setDeleteTarget(null)}
            maxWidth="xs"
            fullWidth
          >
            <DialogTitle sx={{ fontWeight: 700 }}>确认删除</DialogTitle>
            <DialogContent>
              <DialogContentText>
                删除后「{deleteTarget?.plan_name}」将不再生成新的每月还款记录，历史记录不受影响。确认删除吗？
              </DialogContentText>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
              <Button onClick={() => setDeleteTarget(null)} disabled={deleteLoading} color="inherit">
                取消
              </Button>
              <Button
                onClick={handleDeleteConfirm}
                disabled={deleteLoading}
                variant="contained"
                color="error"
                sx={{ minWidth: 80 }}
              >
                {deleteLoading ? <CircularProgress size={20} color="inherit" /> : '确认删除'}
              </Button>
            </DialogActions>
          </Dialog>
        </>
      )}
    </Box>
  )
}
