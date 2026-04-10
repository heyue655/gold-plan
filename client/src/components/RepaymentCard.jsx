import { useState } from 'react'
import {
  Card,
  CardContent,
  Box,
  Typography,
  Checkbox,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material'
import {
  CheckCircle,
  RadioButtonUnchecked,
  Warning,
  MoreVert,
  Edit,
  Delete,
} from '@mui/icons-material'
import { formatAmount } from '../utils/format'

/**
 * 判断某还款日距今天的天数（负数=已过期）
 */
function getDaysUntilDue(dueDateStr, today) {
  const due = new Date(dueDateStr)
  const now = new Date(Date.UTC(today.year, today.month - 1, today.day))
  const diff = Math.round((due - now) / (1000 * 60 * 60 * 24))
  return diff
}

export default function RepaymentCard({ repayment, today, onToggle, onEdit, onDelete, readOnly, toggleOnly, ownerName }) {
  const [anchorEl, setAnchorEl] = useState(null)
  const menuOpen = Boolean(anchorEl)

  const handleMenuOpen = (e) => {
    e.stopPropagation()
    setAnchorEl(e.currentTarget)
  }
  const handleMenuClose = (e) => {
    e?.stopPropagation()
    setAnchorEl(null)
  }
  const handleEdit = (e) => {
    e.stopPropagation()
    setAnchorEl(null)
    onEdit(repayment)
  }
  const handleDelete = (e) => {
    e.stopPropagation()
    setAnchorEl(null)
    onDelete(repayment)
  }
  const daysUntil = getDaysUntilDue(repayment.due_date, today)
  const isPaid = Boolean(repayment.is_paid)

  // 即将到期：3天内未还
  const isUrgent = !isPaid && daysUntil >= 0 && daysUntil <= 3
  // 已逾期：过了还款日未还
  const isOverdue = !isPaid && daysUntil < 0

  let urgentLabel = null
  if (isOverdue) {
    urgentLabel = <Chip label={`逾期 ${Math.abs(daysUntil)} 天`} size="small" color="error" sx={{ height: 22 }} />
  } else if (isUrgent) {
    urgentLabel = (
      <Chip
        icon={<Warning sx={{ fontSize: 14 }} />}
        label={daysUntil === 0 ? '今日到期' : `${daysUntil} 天后到期`}
        size="small"
        color="warning"
        sx={{ height: 22 }}
      />
    )
  }

  const dueDateFormatted = new Date(repayment.due_date).toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
  })

  return (
    <Card
      sx={{
        mb: 1.5,
        border: '1px solid',
        borderColor: isOverdue
          ? 'error.200'
          : isUrgent
          ? 'warning.300'
          : isPaid
          ? 'success.200'
          : 'grey.200',
        backgroundColor: isPaid ? 'grey.50' : '#fff',
        transition: 'all 0.2s',
        cursor: (readOnly && !toggleOnly) ? 'default' : 'pointer',
        '&:active': { transform: (readOnly && !toggleOnly) ? 'none' : 'scale(0.99)' },
      }}
      onClick={() => !(readOnly && !toggleOnly) && onToggle && onToggle(repayment)}
    >
      <CardContent
        sx={{
          py: 1.5,
          px: 2,
          '&:last-child': { pb: 1.5 },
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
        <Checkbox
          checked={isPaid}
          onChange={() => !(readOnly && !toggleOnly) && onToggle && onToggle(repayment)}
          onClick={(e) => e.stopPropagation()}
          icon={<RadioButtonUnchecked />}
          checkedIcon={<CheckCircle />}
          color="success"
          sx={{ p: 0 }}
          disabled={readOnly && !toggleOnly}
          inputProps={{ 'aria-label': `${repayment.plan_name} 已还款` }}
        />

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography
              variant="body1"
              fontWeight={600}
              sx={{
                textDecoration: isPaid ? 'line-through' : 'none',
                color: isPaid ? 'text.disabled' : 'text.primary',
              }}
              noWrap
            >
              {repayment.plan_name}
            </Typography>
            {urgentLabel}
          </Box>
          <Typography variant="caption" color="text.secondary">
            还款日：{dueDateFormatted}
            {isPaid && repayment.paid_at && (
              <>
                {' · 已于 '}
                {new Date(repayment.paid_at).toLocaleDateString('zh-CN', {
                  month: 'short',
                  day: 'numeric',
                })}{' '}
                还款
              </>
            )}
          </Typography>
          {ownerName && (
            <Typography variant="caption" color="primary.main" fontWeight={600}>
              {ownerName}
            </Typography>
          )}
        </Box>

        <Typography
          variant="h6"
          fontWeight={700}
          sx={{
            color: isPaid ? 'text.disabled' : isOverdue ? 'error.main' : isUrgent ? 'warning.main' : 'text.primary',
            flexShrink: 0,
          }}
        >
          ¥{formatAmount(repayment.amount)}
        </Typography>

        {/* 操作菜单 — 只读模式下隐藏（toggleOnly 不显示编辑/删除） */}
        {!readOnly && onEdit && onDelete && (
          <>
            <IconButton
              size="small"
              onClick={handleMenuOpen}
              aria-label="更多操作"
              sx={{ flexShrink: 0, ml: -0.5 }}
            >
              <MoreVert fontSize="small" />
            </IconButton>
            <Menu
              anchorEl={anchorEl}
              open={menuOpen}
              onClose={handleMenuClose}
              onClick={(e) => e.stopPropagation()}
              transformOrigin={{ horizontal: 'right', vertical: 'top' }}
              anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            >
              <MenuItem onClick={handleEdit}>
                <ListItemIcon><Edit fontSize="small" /></ListItemIcon>
                <ListItemText>编辑计划</ListItemText>
              </MenuItem>
              <MenuItem onClick={handleDelete} sx={{ color: 'error.main' }}>
                <ListItemIcon><Delete fontSize="small" color="error" /></ListItemIcon>
                <ListItemText>删除计划</ListItemText>
              </MenuItem>
            </Menu>
          </>
        )}
      </CardContent>
    </Card>
  )
}
