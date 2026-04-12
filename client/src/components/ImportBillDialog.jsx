import { useState, useRef } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Alert,
  Box,
  CircularProgress,
  Chip,
  Stack,
} from '@mui/material'
import { UploadFile, CheckCircle } from '@mui/icons-material'
import api from '../api/axios'

const SOURCE_CONFIG = {
  wechat: {
    label: '微信账单',
    accept: '.xlsx,.xls,.csv',
    tip: '请上传从微信导出的「微信支付账单流水文件」Excel 文件',
  },
  alipay: {
    label: '支付宝账单',
    accept: '.xlsx,.xls,.csv',
    tip: '请上传从支付宝导出的账单 Excel/CSV 文件',
  },
}

export default function ImportBillDialog({ open, onClose, source, onSuccess }) {
  const config = SOURCE_CONFIG[source] || SOURCE_CONFIG.wechat
  const fileRef = useRef(null)
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const handleFileChange = (e) => {
    const f = e.target.files?.[0]
    if (f) {
      setFile(f)
      setError('')
      setResult(null)
    }
  }

  const handleImport = async () => {
    if (!file) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const { data } = await api.post(`/import/${source}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult(data)
      onSuccess?.()
    } catch (err) {
      setError(err.response?.data?.message || '导入失败，请检查文件格式')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (loading) return
    setFile(null)
    setError('')
    setResult(null)
    onClose()
  }

  // 将 stats 转成排序后的数组展示
  const statsList = result
    ? Object.entries(result.stats)
        .map(([key, count]) => {
          const [type, category] = key.split('|')
          return { type, category, count }
        })
        .sort((a, b) => b.count - a.count)
    : []

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontWeight: 700 }}>导入{config.label}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {!result ? (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2, mt: 0.5 }}>
              {config.tip}
            </Typography>

            <Box
              onClick={() => fileRef.current?.click()}
              sx={{
                border: '2px dashed',
                borderColor: file ? 'primary.main' : 'divider',
                borderRadius: 2,
                p: 3,
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'border-color 0.2s',
                '&:hover': { borderColor: 'primary.main' },
                bgcolor: file ? 'primary.50' : 'transparent',
              }}
            >
              <UploadFile sx={{ fontSize: 40, color: file ? 'primary.main' : 'text.disabled', mb: 1 }} />
              <Typography variant="body2" color={file ? 'primary.main' : 'text.secondary'} fontWeight={file ? 600 : 400}>
                {file ? file.name : '点击选择文件'}
              </Typography>
              {file && (
                <Typography variant="caption" color="text.secondary">
                  {(file.size / 1024).toFixed(1)} KB
                </Typography>
              )}
            </Box>
            <input
              ref={fileRef}
              type="file"
              accept={config.accept}
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </>
        ) : (
          <Box sx={{ mt: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <CheckCircle color="success" />
              <Typography variant="body1" fontWeight={700}>
                导入成功！
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              成功导入 <strong>{result.imported}</strong> 笔记录
              {result.duplicates > 0 && `，跳过 ${result.duplicates} 笔重复`}
              {result.skipped > 0 && `，过滤 ${result.skipped} 笔无关交易`}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              分类统计：
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={0.75}>
              {statsList.map(({ type, category, count }) => (
                <Chip
                  key={`${type}|${category}`}
                  label={`${category} ${count}笔`}
                  size="small"
                  color={type === 'EXPENSE' ? 'error' : 'success'}
                  variant="outlined"
                />
              ))}
            </Stack>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={loading} color="inherit">
          {result ? '关闭' : '取消'}
        </Button>
        {!result && (
          <Button
            variant="contained"
            onClick={handleImport}
            disabled={!file || loading}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {loading ? '导入中…' : '开始导入'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
