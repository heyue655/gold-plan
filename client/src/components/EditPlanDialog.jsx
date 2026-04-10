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
  Slider,
  Typography,
  Box,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormLabel,
} from '@mui/material'
import api from '../api/axios'

export default function EditPlanDialog({ open, plan, onClose, onSuccess }) {
  const [form, setForm] = useState({ name: '', amount: '', due_day: 1, repay_type: 'MONTHLY' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 每次打开时用 plan 数据初始化表单
  useEffect(() => {
    if (plan) {
      setForm({
        name: plan.plan_name || '',
        amount: String(plan.amount || ''),
        due_day: plan.due_day || 1,
        repay_type: plan.repay_type || 'MONTHLY',
      })
      setError('')
    }
  }, [plan])

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
    setError('')
  }

  const handleClose = () => {
    if (loading) return
    setError('')
    onClose()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('请填写还款项名称')
      return
    }
    if (!form.amount || parseFloat(form.amount) <= 0) {
      setError('请填写有效的还款金额')
      return
    }

    setLoading(true)
    try {
      await api.put(`/plans/${plan.plan_id}`, {
        name: form.name.trim(),
        amount: parseFloat(form.amount),
        due_day: form.due_day,
        repay_type: form.repay_type,
      })
      setError('')
      onSuccess()
      onClose()
    } catch (err) {
      setError(err.response?.data?.message || '修改失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontWeight: 700 }}>编辑还款计划</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Box component="form" id="edit-plan-form" onSubmit={handleSubmit} noValidate>
          <TextField
            label="还款项名称"
            name="name"
            value={form.name}
            onChange={handleChange}
            fullWidth
            margin="normal"
            autoFocus
            disabled={loading}
            inputProps={{ maxLength: 100 }}
          />
          <TextField
            label="还款金额"
            name="amount"
            type="number"
            value={form.amount}
            onChange={handleChange}
            fullWidth
            margin="normal"
            disabled={loading}
            InputProps={{
              startAdornment: <InputAdornment position="start">¥</InputAdornment>,
              inputProps: { min: 0.01, step: 0.01 },
            }}
          />

          <Box sx={{ mt: 2, mb: 1 }}>
            <FormLabel component="legend" sx={{ fontSize: '0.875rem', color: 'text.secondary', mb: 0.5 }}>
              还款类型
            </FormLabel>
            <RadioGroup
              row
              value={form.repay_type}
              onChange={(e) => setForm((prev) => ({ ...prev, repay_type: e.target.value }))}
            >
              <FormControlLabel value="MONTHLY" control={<Radio size="small" />} label="每月" disabled={loading} />
              <FormControlLabel value="ONCE" control={<Radio size="small" />} label="单次" disabled={loading} />
            </RadioGroup>
          </Box>

          <Box sx={{ mt: 2, mb: 1 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              还款日
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Slider
                value={form.due_day}
                min={1}
                max={31}
                step={1}
                marks={[
                  { value: 1, label: '1' },
                  { value: 10, label: '10' },
                  { value: 20, label: '20' },
                  { value: 31, label: '31' },
                ]}
                onChange={(_, v) => setForm((prev) => ({ ...prev, due_day: v }))}
                disabled={loading}
                sx={{ flex: 1 }}
              />
              <Box
                sx={{
                  minWidth: 44,
                  height: 44,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: 'primary.main',
                  color: '#fff',
                  borderRadius: 2,
                  fontWeight: 700,
                  fontSize: '1.1rem',
                  flexShrink: 0,
                }}
              >
                {form.due_day}
              </Box>
            </Box>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button onClick={handleClose} disabled={loading} color="inherit">
          取消
        </Button>
        <Button
          type="submit"
          form="edit-plan-form"
          variant="contained"
          disabled={loading}
          sx={{ minWidth: 80 }}
        >
          {loading ? <CircularProgress size={20} color="inherit" /> : '保存修改'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
