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
  Slider,
  Typography,
  Box,
} from '@mui/material'
import api from '../api/axios'

const defaultForm = { name: '', amount: '', due_day: 1 }

export default function AddPlanDialog({ open, onClose, onSuccess }) {
  const [form, setForm] = useState(defaultForm)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
    setError('')
  }

  const handleClose = () => {
    if (loading) return
    setForm(defaultForm)
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
      await api.post('/plans', {
        name: form.name.trim(),
        amount: parseFloat(form.amount),
        due_day: form.due_day,
      })
      setForm(defaultForm)
      setError('')
      onSuccess()
      onClose()
    } catch (err) {
      setError(err.response?.data?.message || '添加失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontWeight: 700 }}>添加还款计划</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Box component="form" id="add-plan-form" onSubmit={handleSubmit} noValidate>
          <TextField
            label="还款项名称"
            name="name"
            value={form.name}
            onChange={handleChange}
            fullWidth
            margin="normal"
            placeholder="如：招商信用卡、工行信用卡"
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
            <Typography variant="body2" color="text.secondary" gutterBottom>
              每月还款日
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
          form="add-plan-form"
          variant="contained"
          disabled={loading}
          sx={{ minWidth: 80 }}
        >
          {loading ? <CircularProgress size={20} color="inherit" /> : '确认添加'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
