import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  CircularProgress,
  Alert,
  Card,
  Chip,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from '@mui/material'
import { ChevronLeft, ChevronRight, Add, Delete } from '@mui/icons-material'
import api from '../api/axios'
import AddLedgerDialog from '../components/AddLedgerDialog'
import { formatAmount } from '../utils/format'

const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

function getToday() {
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${d.getMonth() + 1}月${d.getDate()}日 ${weekDays[d.getDay()]}`
}

export default function LedgerPage() {
  const today = getToday()
  const [current, setCurrent] = useState({ year: today.year, month: today.month })
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const fetchEntries = useCallback(async (year, month) => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get('/ledger', { params: { year, month } })
      setEntries(data)
    } catch (err) {
      setError(err.response?.data?.message || '加载失败，请刷新重试')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchEntries(current.year, current.month)
  }, [current, fetchEntries])

  const handlePrevMonth = () =>
    setCurrent((prev) =>
      prev.month === 1 ? { year: prev.year - 1, month: 12 } : { ...prev, month: prev.month - 1 }
    )

  const handleNextMonth = () =>
    setCurrent((prev) =>
      prev.month === 12 ? { year: prev.year + 1, month: 1 } : { ...prev, month: prev.month + 1 }
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

  // 月度统计（前端计算）
  const totalExpense = entries
    .filter((e) => e.type === 'EXPENSE')
    .reduce((sum, e) => sum + e.amount, 0)
  const totalIncome = entries
    .filter((e) => e.type === 'INCOME')
    .reduce((sum, e) => sum + e.amount, 0)
  const balance = totalIncome - totalExpense

  // 按日期分组（降序）
  const grouped = {}
  entries.forEach((e) => {
    if (!grouped[e.date]) grouped[e.date] = []
    grouped[e.date].push(e)
  })
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  return (
    <Box>
      <AppBar position="sticky" elevation={0} sx={{ backgroundColor: 'primary.main' }}>
        <Toolbar>
          <IconButton color="inherit" onClick={handlePrevMonth} aria-label="上个月" size="large">
            <ChevronLeft />
          </IconButton>
          <Box sx={{ flex: 1, textAlign: 'center' }}>
            <Typography variant="h6" fontWeight={700}>
              {current.year}年{MONTH_NAMES[current.month - 1]}账本
            </Typography>
          </Box>
          <IconButton color="inherit" onClick={handleNextMonth} aria-label="下个月" size="large">
            <ChevronRight />
          </IconButton>
          <IconButton color="inherit" onClick={() => setAddOpen(true)} aria-label="记一笔">
            <Add />
          </IconButton>
        </Toolbar>

        {/* 月度汇总栏 */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-around',
            pb: 1.5,
            px: 2,
            borderTop: '1px solid rgba(255,255,255,0.15)',
            pt: 1,
          }}
        >
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.75)' }}>
              支出
            </Typography>
            <Typography variant="body2" fontWeight={700} sx={{ color: '#fff' }}>
              ¥{formatAmount(totalExpense)}
            </Typography>
          </Box>
          <Box sx={{ width: '1px', bgcolor: 'rgba(255,255,255,0.3)' }} />
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.75)' }}>
              收入
            </Typography>
            <Typography variant="body2" fontWeight={700} sx={{ color: '#fff' }}>
              ¥{formatAmount(totalIncome)}
            </Typography>
          </Box>
          <Box sx={{ width: '1px', bgcolor: 'rgba(255,255,255,0.3)' }} />
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.75)' }}>
              结余
            </Typography>
            <Typography
              variant="body2"
              fontWeight={700}
              sx={{ color: balance >= 0 ? '#a5d6a7' : '#ef9a9a' }}
            >
              {balance < 0 ? '-' : ''}¥{formatAmount(Math.abs(balance))}
            </Typography>
          </Box>
        </Box>
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

        {!loading && !error && entries.length === 0 && (
          <Box sx={{ textAlign: 'center', mt: 8, color: 'text.secondary' }}>
            <Typography variant="h6" gutterBottom>
              本月暂无记账记录
            </Typography>
            <Typography variant="body2">点击右上角 + 开始记账</Typography>
          </Box>
        )}

        {!loading &&
          sortedDates.map((date) => (
            <Box key={date} sx={{ mb: 2 }}>
              {/* 日期标题 */}
              <Typography
                variant="caption"
                color="text.secondary"
                fontWeight={600}
                sx={{ pl: 0.5, mb: 0.75, display: 'block' }}
              >
                {formatDateLabel(date)}
              </Typography>

              {/* 当日条目 */}
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
                        <Typography variant="body2" noWrap color={entry.note ? 'text.primary' : 'text.secondary'}>
                          {entry.note || entry.category}
                        </Typography>
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
        onSuccess={() => fetchEntries(current.year, current.month)}
      />

      {/* 删除确认对话框 */}
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
          <Button
            onClick={() => setDeleteTarget(null)}
            disabled={deleteLoading}
            color="inherit"
          >
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
    </Box>
  )
}
