import { useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Slider,
  TextField,
  InputAdornment,
  CircularProgress,
  Alert,
} from '@mui/material'
import api from '../api/axios'

export default function GeneratePlanDialog({ open, onClose, onGenerated, defaultTarget }) {
  const [weeks, setWeeks] = useState(8)
  const [savingsTarget, setSavingsTarget] = useState(defaultTarget || '')
  const [monthlyIncome, setMonthlyIncome] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    setLoading(true)
    setError('')
    try {
      await api.post('/savings-plan/generate', {
        weeks,
        savingsTarget: savingsTarget ? parseFloat(savingsTarget) : undefined,
        monthlyIncome: monthlyIncome ? parseFloat(monthlyIncome) : undefined,
      })
      onGenerated()
      onClose()
    } catch (err) {
      setError(err.response?.data?.message || '生成失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (loading) return
    setError('')
    onClose()
  }

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontWeight: 700 }}>生成预算控制计划</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5, mt: 1 }}>
          计划周数：{weeks} 周
        </Typography>
        <Slider
          value={weeks}
          onChange={(_, v) => setWeeks(v)}
          min={4}
          max={12}
          step={1}
          marks={[
            { value: 4, label: '4周' },
            { value: 8, label: '8周' },
            { value: 12, label: '12周' },
          ]}
          sx={{ mb: 2.5 }}
        />

        <TextField
          label="月收入（可选）"
          value={monthlyIncome}
          onChange={(e) => setMonthlyIncome(e.target.value)}
          type="number"
          fullWidth
          helperText="不填则自动取近3个月平均收入"
          InputProps={{
            startAdornment: <InputAdornment position="start">¥</InputAdornment>,
            inputProps: { min: 0 },
          }}
          disabled={loading}
          sx={{ mb: 2 }}
        />

        <TextField
          label="每月留金目标（可选）"
          value={savingsTarget}
          onChange={(e) => setSavingsTarget(e.target.value)}
          type="number"
          fullWidth
          helperText="不填则按年度留金目标与计划周数自动分摊，无目标时取收入20%"
          InputProps={{
            startAdornment: <InputAdornment position="start">¥</InputAdornment>,
            inputProps: { min: 0 },
          }}
          disabled={loading}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>取消</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {loading ? '提交中…' : '开始生成'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
