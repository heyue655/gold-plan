import { useState, useEffect } from 'react'
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
  Divider,
} from '@mui/material'
import { UploadFile } from '@mui/icons-material'
import api from '../api/axios'
import ImportBillDialog from './ImportBillDialog'

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

function defaultForm(type = 'EXPENSE') {
  return {
    type,
    amount: '',
    category: CATEGORIES[type][0],
    note: '',
    date: new Date().toISOString().split('T')[0],
  }
}

export default function AddLedgerDialog({ open, onClose, onSuccess, editEntry }) {
  const isEdit = Boolean(editEntry)
  const [form, setForm] = useState(defaultForm())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [importSource, setImportSource] = useState(null)

  // 编辑模式：打开时填充表单
  useEffect(() => {
    if (!open) return
    if (editEntry) {
      const cat = CATEGORIES[editEntry.type]?.includes(editEntry.category) ? editEntry.category : CATEGORIES[editEntry.type]?.[0] || '其他'
      setForm({
        type: editEntry.type,
        amount: String(editEntry.amount),
        category: cat,
        note: editEntry.note || '',
        date: editEntry.date,
      })
    } else {
      setForm(defaultForm())
    }
    setError('')
  }, [open, editEntry])

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
      const payload = {
        type: form.type,
        amount: parseFloat(form.amount),
        category: form.category,
        note: form.note.trim() || null,
        date: form.date,
      }
      if (isEdit) {
        await api.put(`/ledger/${editEntry.id}`, payload)
      } else {
        await api.post('/ledger', payload)
      }
      setForm(defaultForm())
      setError('')
      onSuccess()
      onClose()
    } catch (err) {
      setError(err.response?.data?.message || (isEdit ? '修改失败' : '记录失败，请稍后重试'))
    } finally {
      setLoading(false)
    }
  }

  const isExpense = form.type === 'EXPENSE'

  return (
    <>
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>{isEdit ? '修改记录' : '记一笔'}</DialogTitle>
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

        {!isEdit && (
          <>
            <Divider sx={{ mt: 2, mb: 1 }} />
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.75, display: 'block' }}>
              批量导入账单
            </Typography>
            <Stack direction="row" gap={1}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<UploadFile sx={{ fontSize: 16 }} />}
                onClick={() => setImportSource('wechat')}
                disabled={loading}
                sx={{ textTransform: 'none', fontSize: 12 }}
              >
                导入微信账单
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<UploadFile sx={{ fontSize: 16 }} />}
                onClick={() => setImportSource('alipay')}
                disabled={loading}
                sx={{ textTransform: 'none', fontSize: 12 }}
              >
                导入支付宝账单
              </Button>
            </Stack>
          </>
        )}
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
          {loading ? <CircularProgress size={20} color="inherit" /> : isEdit ? '保存修改' : '确认记录'}
        </Button>
      </DialogActions>
    </Dialog>

    <ImportBillDialog
      open={Boolean(importSource)}
      source={importSource || 'wechat'}
      onClose={() => setImportSource(null)}
      onSuccess={onSuccess}
    />
    </>
  )
}
