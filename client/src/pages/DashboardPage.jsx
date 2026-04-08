import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Chip,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Fab,
} from '@mui/material'
import { ChevronLeft, ChevronRight, Add, Delete } from '@mui/icons-material'
import api from '../api/axios'
import AddLedgerDialog from '../components/AddLedgerDialog'
import { formatAmount } from '../utils/format'
import { useAuth } from '../context/AuthContext'

const MONTH_NAMES = [
  '1月', '2月', '3月', '4月', '5月', '6月',
  '7月', '8月', '9月', '10月', '11月', '12月',
]

function formatDateLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${d.getMonth() + 1}月${d.getDate()}日 ${weekDays[d.getDay()]}`
}

function SummaryCard({ label, value, color, borderColor }) {
  return (
    <Card
      sx={{
        flex: 1,
        border: '1px solid',
        borderColor: borderColor,
        borderRadius: 2,
      }}
    >
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 }, textAlign: 'center' }}>
        <Typography variant="caption" color="text.secondary" display="block">
          {label}
        </Typography>
        <Typography variant="body2" fontWeight={700} sx={{ color, mt: 0.25, wordBreak: 'break-all' }}>
          ¥{formatAmount(Math.abs(value))}
        </Typography>
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const now = new Date()
  const [current, setCurrent] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 })
  const [scope, setScope] = useState('all')
  const [familyMembers, setFamilyMembers] = useState([])
  const [summary, setSummary] = useState(null)
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // 加载家庭成员列表
  useEffect(() => {
    api.get('/family').then(({ data }) => setFamilyMembers(data.members)).catch(() => {})
  }, [])

  const fetchAll = useCallback(async (year, month, sc) => {
    setLoading(true)
    setError('')
    try {
      const [dashRes, ledgerRes] = await Promise.all([
        api.get('/dashboard', { params: { year, month, scope: sc } }),
        api.get('/ledger', { params: { year, month, scope: sc } }),
      ])
      setSummary(dashRes.data.current)
      setEntries(ledgerRes.data)
    } catch (err) {
      setError(err.response?.data?.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll(current.year, current.month, scope)
  }, [current, scope, fetchAll])

  const handlePrev = () =>
    setCurrent((p) =>
      p.month === 1 ? { year: p.year - 1, month: 12 } : { ...p, month: p.month - 1 }
    )
  const handleNext = () =>
    setCurrent((p) =>
      p.month === 12 ? { year: p.year + 1, month: 1 } : { ...p, month: p.month + 1 }
    )

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    setDeleteLoading(true)
    try {
      await api.delete(`/ledger/${deleteTarget.id}`)
      setEntries((prev) => prev.filter((e) => e.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (err) {
      setError(err.response?.data?.message || '删除失败')
      setDeleteTarget(null)
    } finally {
      setDeleteLoading(false)
    }
  }

  // 按日期分组（降序）
  const grouped = {}
  entries.forEach((e) => {
    if (!grouped[e.date]) grouped[e.date] = []
    grouped[e.date].push(e)
  })
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  const balanceColor = !summary
    ? 'text.primary'
    : summary.balance >= 0
    ? 'success.main'
    : 'error.main'

  return (
    <Box>
      <AppBar position="sticky" elevation={0} sx={{ backgroundColor: 'primary.main' }}>
        <Toolbar>
          <IconButton color="inherit" onClick={handlePrev} size="large" aria-label="上个月">
            <ChevronLeft />
          </IconButton>
          <Box sx={{ flex: 1, textAlign: 'center' }}>
            <Typography variant="h6" fontWeight={700}>
              {current.year}年{MONTH_NAMES[current.month - 1]}
            </Typography>
          </Box>
          <IconButton color="inherit" onClick={handleNext} size="large" aria-label="下个月">
            <ChevronRight />
          </IconButton>
        </Toolbar>

        {/* 范围切换 chips （仅有家庭成员时显示） */}
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
            {[{ key: 'all', label: '全部' }, { key: 'mine', label: '只看我的' }, ...familyMembers.map((m) => ({ key: String(m.id), label: m.username + '的' }))]
              .map((tab) => (
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

        {!loading && error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {!loading && summary && (
          <>
            {/* 三栏汇总卡片 */}
            <Box sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
              <SummaryCard
                label="收入"
                value={summary.income}
                color="success.main"
                borderColor="success.200"
              />
              <SummaryCard
                label="支出(含还款)"
                value={summary.total_expense}
                color="error.main"
                borderColor="error.200"
              />
              <Card
                sx={{
                  flex: 1,
                  border: '1px solid',
                  borderColor: summary.balance >= 0 ? 'success.200' : 'error.200',
                  borderRadius: 2,
                }}
              >
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 }, textAlign: 'center' }}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    结余
                  </Typography>
                  <Typography
                    variant="body2"
                    fontWeight={700}
                    sx={{ color: balanceColor, mt: 0.25, wordBreak: 'break-all' }}
                  >
                    {summary.balance < 0 ? '-' : ''}¥{formatAmount(Math.abs(summary.balance))}
                  </Typography>
                </CardContent>
              </Card>
            </Box>

            {/* 还款小提示 */}
            {summary.repayment > 0 && (
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  bgcolor: 'grey.50',
                  border: '1px solid',
                  borderColor: 'grey.200',
                  borderRadius: 2,
                  px: 2,
                  py: 0.75,
                  mb: 2,
                }}
              >
                <Typography variant="caption" color="text.secondary">记账支出</Typography>
                <Typography variant="caption" fontWeight={600} color="text.secondary">
                  ¥{formatAmount(summary.ledger_expense)}
                </Typography>
                <Box sx={{ width: '1px', bgcolor: 'grey.200' }} />
                <Typography variant="caption" color="text.secondary">信用卡还款</Typography>
                <Typography variant="caption" fontWeight={600} color="secondary.main">
                  ¥{formatAmount(summary.repayment)}
                </Typography>
              </Box>
            )}
          </>
        )}

        {/* 记账明细列表 */}
        {!loading && !error && entries.length === 0 && (
          <Box sx={{ textAlign: 'center', mt: 8, color: 'text.secondary' }}>
            <Typography variant="h6" gutterBottom>本月暂无记账记录</Typography>
            <Typography variant="body2">点击右下角 + 开始记账</Typography>
          </Box>
        )}

        {!loading &&
          sortedDates.map((date) => (
            <Box key={date} sx={{ mb: 2 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                fontWeight={600}
                sx={{ pl: 0.5, mb: 0.75, display: 'block' }}
              >
                {formatDateLabel(date)}
              </Typography>
              <Card variant="outlined" sx={{ borderRadius: 2 }}>
                {grouped[date].map((entry, idx) => (
                  <Box key={entry.id}>
                    {idx > 0 && <Divider />}
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        px: 2,
                        py: 1.25,
                      }}
                    >
                      <Chip
                        label={entry.category}
                        size="small"
                        color={entry.type === 'EXPENSE' ? 'error' : 'success'}
                        variant="outlined"
                        sx={{ flexShrink: 0 }}
                      />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          noWrap
                          color={entry.note ? 'text.primary' : 'text.secondary'}
                        >
                          {entry.note || entry.category}
                        </Typography>
                        {/* 显示帐号标识（全部视图且有家庭成员时） */}
                        {scope === 'all' && familyMembers.length > 0 && entry.username && entry.user_id !== user?.id && (
                          <Typography variant="caption" color="primary.main" sx={{ fontWeight: 600 }}>
                            {entry.username}
                          </Typography>
                        )}
                      </Box>
                      <Typography
                        variant="body1"
                        fontWeight={700}
                        sx={{
                          flexShrink: 0,
                          color: entry.type === 'EXPENSE' ? 'error.main' : 'success.main',
                        }}
                      >
                        {entry.type === 'EXPENSE' ? '-' : '+'}¥{formatAmount(entry.amount)}
                      </Typography>
                      <IconButton
                        size="small"
                        onClick={() => setDeleteTarget(entry)}
                        aria-label="删除"
                        sx={{
                          flexShrink: 0,
                          color: 'text.disabled',
                          '&:hover': { color: 'error.main' },
                        }}
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>
                ))}
              </Card>
            </Box>
          ))}
      </Box>

      <AddLedgerDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={() => fetchAll(current.year, current.month, scope)}
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
            确认删除这条「{deleteTarget?.category}」记录？此操作不可撤销。
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

      <Fab
        color="primary"
        aria-label="记一笔"
        onClick={() => setAddOpen(true)}
        sx={{ position: 'fixed', bottom: 76, right: 16, zIndex: 1200 }}
      >
        <Add />
      </Fab>
    </Box>
  )
}
