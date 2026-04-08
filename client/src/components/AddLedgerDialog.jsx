import { useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  CircularProgress,
  Alert,
  InputAdornment,
  ToggleButtonGroup,
  ToggleButton,
  Box,
  Typography,
  Chip,
  Stack,
} from '@mui/material'
import api from '../api/axios'

const CATEGORIES = {
  EXPENSE: ['餐饮', '交通', '购物', '娱乐', '住房', '医疗', '通讯', '其他'],
  INCOME: ['工资', '兼职', '副业', '理财', '红包', '其他'],
}

function defaultForm(type = 'EXPENSE') {
  return {
    type,
    amount: '',
    category: CATEGORIES[type][0],
    note: '',
    date: new Date().toISOString().split('T')[0],
  }
}

export default function AddLedgerDialog({ open, onClose, onSuccess }) {
  const [form, setForm] = useState(defaultForm())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleTypeChange = (_, newType) => {
    if (!newType) return
    setForm(defaultForm(newType))
    setError('')
  }

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
    setError('')
  }

  const handleClose = () => {
    if (loading) return
    setForm(defaultForm())
    setError('')
    onClose()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.amount || parseFloat(form.amount) <= 0) {
      setError('请填写有效的金额')
      return
    }
    setLoading(true)
    try {
      await api.post('/ledger', {
        type: form.type,
        amount: parseFloat(form.amount),
        category: form.category,
        note: form.note.trim() || null,
        date: form.date,
      })
      setForm(defaultForm())
      setError('')
      onSuccess()
      onClose()
    } catch (err) {
      setError(err.response?.data?.message || '记录失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  const isExpense = form.type === 'EXPENSE'

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>记一笔</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Box component="form" id="add-ledger-form" onSubmit={handleSubmit} noValidate>
          {/* 支出 / 收入 切换 */}
          <ToggleButtonGroup
            value={form.type}
            exclusive
            onChange={handleTypeChange}
            fullWidth
            sx={{ mb: 2, mt: 1 }}
          >
            <ToggleButton value="EXPENSE" color="error" sx={{ fontWeight: 600 }}>
              支出
            </ToggleButton>
            <ToggleButton value="INCOME" color="success" sx={{ fontWeight: 600 }}>
              收入
            </ToggleButton>
          </ToggleButtonGroup>

          {/* 金额 */}
          <TextField
            label="金额"
            name="amount"
            type="number"
            value={form.amount}
            onChange={handleChange}
            fullWidth
            margin="normal"
            autoFocus
            disabled={loading}
            InputProps={{
              startAdornment: <InputAdornment position="start">¥</InputAdornment>,
              inputProps: { min: 0.01, step: 0.01 },
            }}
          />

          {/* 分类 */}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, mb: 1 }}>
            分类
          </Typography>
          <Stack direction="row" flexWrap="wrap" gap={0.75}>
            {CATEGORIES[form.type].map((cat) => (
              <Chip
                key={cat}
                label={cat}
                clickable
                onClick={() => setForm((prev) => ({ ...prev, category: cat }))}
                color={form.category === cat ? (isExpense ? 'error' : 'success') : 'default'}
                variant={form.category === cat ? 'filled' : 'outlined'}
                size="small"
                disabled={loading}
              />
            ))}
          </Stack>

          {/* 备注 */}
          <TextField
            label="备注（可选）"
            name="note"
            value={form.note}
            onChange={handleChange}
            fullWidth
            margin="normal"
            disabled={loading}
            inputProps={{ maxLength: 200 }}
          />

          {/* 日期 */}
          <TextField
            label="日期"
            name="date"
            type="date"
            value={form.date}
            onChange={handleChange}
            fullWidth
            margin="normal"
            disabled={loading}
            InputLabelProps={{ shrink: true }}
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button onClick={handleClose} disabled={loading} color="inherit">
          取消
        </Button>
        <Button
          type="submit"
          form="add-ledger-form"
          variant="contained"
          color={isExpense ? 'error' : 'success'}
          disabled={loading}
          sx={{ minWidth: 80 }}
        >
          {loading ? <CircularProgress size={20} color="inherit" /> : '确认记录'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
