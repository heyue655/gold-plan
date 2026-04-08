import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  CircularProgress,
  Alert,
  IconButton,
  Chip,
} from '@mui/material'
import { PersonAdd, Check, Close, LinkOff } from '@mui/icons-material'
import api from '../api/axios'

export default function BindingDialog({ open, onClose, onMembersChange }) {
  const [identifier, setIdentifier] = useState('')
  const [sending, setSending] = useState(false)
  const [sendMsg, setSendMsg] = useState({ type: '', text: '' })

  const [familyData, setFamilyData] = useState({ members: [], pendingReceived: [], pendingSent: [] })
  const [loadingFamily, setLoadingFamily] = useState(false)

  // Use a ref so fetchFamily never changes identity when parent re-renders
  const onMembersChangeRef = useRef(onMembersChange)
  useEffect(() => { onMembersChangeRef.current = onMembersChange })

  const fetchFamily = useCallback(async () => {
    setLoadingFamily(true)
    try {
      const { data } = await api.get('/family')
      setFamilyData(data)
      onMembersChangeRef.current?.(data.members)
    } catch {
      // silently fail
    } finally {
      setLoadingFamily(false)
    }
  }, []) // stable — no deps that change

  useEffect(() => {
    if (open) {
      fetchFamily()
      setIdentifier('')
      setSendMsg({ type: '', text: '' })
    }
  }, [open, fetchFamily])

  const handleSendRequest = async () => {
    if (!identifier.trim()) return
    setSending(true)
    setSendMsg({ type: '', text: '' })
    try {
      const { data } = await api.post('/family/request', { identifier: identifier.trim() })
      setSendMsg({ type: 'success', text: data.message })
      setIdentifier('')
      fetchFamily()
    } catch (err) {
      setSendMsg({ type: 'error', text: err.response?.data?.message || '发送失败' })
    } finally {
      setSending(false)
    }
  }

  const handleAccept = async (bindingId) => {
    try {
      await api.put(`/family/${bindingId}/accept`)
      fetchFamily()
    } catch (err) {
      setSendMsg({ type: 'error', text: err.response?.data?.message || '操作失败' })
    }
  }

  const handleReject = async (bindingId) => {
    try {
      await api.put(`/family/${bindingId}/reject`)
      fetchFamily()
    } catch (err) {
      setSendMsg({ type: 'error', text: err.response?.data?.message || '操作失败' })
    }
  }

  const handleUnbind = async (bindingId) => {
    try {
      await api.delete(`/family/${bindingId}`)
      fetchFamily()
    } catch (err) {
      setSendMsg({ type: 'error', text: err.response?.data?.message || '操作失败' })
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
        <PersonAdd color="primary" />
        家庭绑定
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        {/* 发送绑定请求 */}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          输入对方的用户名或邮箱发起绑定申请
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
          <TextField
            size="small"
            fullWidth
            placeholder="用户名 / 邮箱"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendRequest()}
            disabled={sending}
          />
          <Button
            variant="contained"
            onClick={handleSendRequest}
            disabled={sending || !identifier.trim()}
            sx={{ flexShrink: 0, minWidth: 72 }}
          >
            {sending ? <CircularProgress size={18} color="inherit" /> : '申请'}
          </Button>
        </Box>

        {sendMsg.text && (
          <Alert severity={sendMsg.type} sx={{ mb: 1.5 }} onClose={() => setSendMsg({ type: '', text: '' })}>
            {sendMsg.text}
          </Alert>
        )}

        {loadingFamily && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={24} />
          </Box>
        )}

        {/* 待处理申请（我收到的） */}
        {familyData.pendingReceived.length > 0 && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="caption" fontWeight={700} color="warning.main" sx={{ display: 'block', mb: 0.5 }}>
              待处理申请
            </Typography>
            <List dense disablePadding>
              {familyData.pendingReceived.map((req) => (
                <ListItem key={req.bindingId} disablePadding sx={{ py: 0.5 }}>
                  <ListItemText
                    primary={req.from.username}
                    secondary={req.from.email}
                    primaryTypographyProps={{ fontWeight: 600 }}
                    secondaryTypographyProps={{ fontSize: '0.72rem' }}
                  />
                  <ListItemSecondaryAction>
                    <IconButton
                      size="small"
                      color="success"
                      onClick={() => handleAccept(req.bindingId)}
                      aria-label="同意"
                    >
                      <Check fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleReject(req.bindingId)}
                      aria-label="拒绝"
                    >
                      <Close fontSize="small" />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          </>
        )}

        {/* 已发出的申请（等待对方）*/}
        {familyData.pendingSent.length > 0 && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              已发出（等待对方同意）
            </Typography>
            <List dense disablePadding>
              {familyData.pendingSent.map((req) => (
                <ListItem key={req.bindingId} disablePadding sx={{ py: 0.5 }}>
                  <ListItemText
                    primary={req.to.username}
                    secondary={req.to.email}
                    primaryTypographyProps={{ fontWeight: 600 }}
                    secondaryTypographyProps={{ fontSize: '0.72rem' }}
                  />
                  <Chip label="待确认" size="small" variant="outlined" color="warning" />
                </ListItem>
              ))}
            </List>
          </>
        )}

        {/* 已绑定成员 */}
        {familyData.members.length > 0 && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="caption" fontWeight={700} color="success.main" sx={{ display: 'block', mb: 0.5 }}>
              家庭成员
            </Typography>
            <List dense disablePadding>
              {familyData.members.map((m) => (
                <ListItem key={m.bindingId} disablePadding sx={{ py: 0.5 }}>
                  <ListItemText
                    primary={m.username}
                    secondary={m.email}
                    primaryTypographyProps={{ fontWeight: 600 }}
                    secondaryTypographyProps={{ fontSize: '0.72rem' }}
                  />
                  <ListItemSecondaryAction>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleUnbind(m.bindingId)}
                      aria-label="解除绑定"
                    >
                      <LinkOff fontSize="small" />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          </>
        )}

        {!loadingFamily &&
          familyData.members.length === 0 &&
          familyData.pendingReceived.length === 0 &&
          familyData.pendingSent.length === 0 && (
            <Typography variant="body2" color="text.disabled" sx={{ textAlign: 'center', py: 2 }}>
              暂无家庭成员，发起绑定申请开始共享
            </Typography>
          )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">关闭</Button>
      </DialogActions>
    </Dialog>
  )
}
